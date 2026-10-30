/**
 * services/roomService.js
 * ------------------------------------------------------------------
 * Room / unit queries and the atomic "claim my bed" transaction.
 *
 * Port of:
 *   - js/choose-room.js  (rooms by block, units by room, confirm transaction)
 *   - js/tracking.js     (resolveRoomAndUnit display labels)
 *
 * Reads stay incremental (per block, per room) exactly like the website,
 * so the app never downloads the whole 1,500-document units collection in
 * the resident flow.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "../config/firebase";
import { sortRooms } from "../utils/rooms";

/** Rooms in one block: rooms where block == <block> (js/choose-room.js). */
export async function fetchRoomsByBlock(block) {
  const snapshot = await getDocs(
    query(collection(db, "rooms"), where("block", "==", block))
  );
  const rooms = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  return sortRooms(rooms);
}

/** A single room document, or null. */
export async function fetchRoom(roomId) {
  if (!roomId) return null;
  const snapshot = await getDoc(doc(db, "rooms", roomId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** All bed slots belonging to a parent room: units where roomId == <id>. */
export async function fetchUnitsByRoom(roomId) {
  const snapshot = await getDocs(
    query(collection(db, "units"), where("roomId", "==", roomId))
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** A single unit (bed slot) document, or null. */
export async function fetchUnit(unitId) {
  if (!unitId) return null;
  const snapshot = await getDoc(doc(db, "units", unitId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/**
 * Resolve the display labels used by the tracking screens.
 * Cached per page session by the caller, mirroring js/tracking.js which
 * avoids N+1 reads by caching because a resident owns a single room/unit.
 */
export async function resolveRoomAndUnitLabels(roomId, unitId, cache) {
  let roomLabel = roomId || "—";
  let unitLabel = unitId || "—";

  try {
    if (roomId) {
      if (cache?.room?.[roomId]) {
        roomLabel = cache.room[roomId];
      } else {
        const room = await fetchRoom(roomId);
        roomLabel = room?.roomNumber ?? roomId;
        if (cache?.room) cache.room[roomId] = roomLabel;
      }
    }
    if (unitId) {
      if (cache?.unit?.[unitId]) {
        unitLabel = cache.unit[unitId];
      } else {
        const unit = await fetchUnit(unitId);
        unitLabel = unit?.unitName ?? unitId;
        if (cache?.unit) cache.unit[unitId] = unitLabel;
      }
    }
  } catch (error) {
    console.warn("[roomService] could not resolve room/unit:", error);
  }

  return { roomLabel, unitLabel };
}

/**
 * Claim a bed slot for the signed-in resident.
 *
 * This is the same Firestore transaction the website runs in
 * js/choose-room.js, and therefore satisfies the same Security Rules
 * (users + units update branches, including the `getAfter()` checks):
 *   1. re-read the selected unit,
 *   2. refuse when it is no longer available,
 *   3. refuse when the resident already has a room,
 *   4. mark the unit occupied and assign residentId,
 *   5. write roomId/unitId/roomLetter/block/roomNumber onto the profile.
 *
 * `roomLetter` keeps the same fallback chain as the website
 * (roomLetter || unitName) so both clients store identical values.
 */
export async function claimUnit({ uid, unit, room }) {
  if (!uid || !unit?.id || !room?.id) {
    throw new Error("Missing selection. Please choose a room again.");
  }

  await runTransaction(db, async (transaction) => {
    const unitRef = doc(db, "units", unit.id);
    const unitSnap = await transaction.get(unitRef);

    if (!unitSnap.exists()) {
      throw new Error("This unit no longer exists. Please choose another.");
    }
    if (unitSnap.data().occupied !== false) {
      throw new Error("Sorry, this room was just taken. Please choose another.");
    }

    const userRef = doc(db, "users", uid);
    const userSnap = await transaction.get(userRef);
    const userData = userSnap.exists() ? userSnap.data() : null;
    if (userData?.roomId) {
      throw new Error("You already have a room assigned.");
    }

    transaction.update(unitRef, { occupied: true, residentId: uid });
    transaction.update(userRef, {
      roomId: room.id,
      unitId: unit.id,
      roomLetter: unit.roomLetter || unit.unitName || null,
      block: room.block ?? unit.block ?? null,
      roomNumber: Number(room.roomNumber ?? unit.roomNumber),
    });
  });
}

/**
 * Repair bed slots left occupied by a resident profile that no longer
 * exists. The website does this in two places: the deployed Cloud Function
 * (functions/index.js) handles it immediately, and the management
 * dashboard repairs older orphans when it opens (releaseOrphanedUnits).
 * The mobile management client performs the same repair so both clients
 * report the same availability.
 */
export async function releaseOrphanedUnits(units, usersMap) {
  const orphaned = units.filter(
    (unit) => unit.occupied === true && unit.residentId && !usersMap[unit.residentId]
  );
  if (orphaned.length === 0) return 0;

  // Firestore batches allow at most 500 writes per commit (js/management.js).
  for (let start = 0; start < orphaned.length; start += 500) {
    const batch = writeBatch(db);
    orphaned.slice(start, start + 500).forEach((unit) => {
      batch.update(doc(db, "units", unit.id), { occupied: false, residentId: null });
    });
    await batch.commit();
  }

  // Keep the in-memory objects consistent with the successful writes.
  orphaned.forEach((unit) => {
    unit.occupied = false;
    unit.residentId = null;
  });

  return orphaned.length;
}
