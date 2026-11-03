/**
 * services/announcementService.js
 * ------------------------------------------------------------------
 * Shared room/unit announcements:
 *   unitAnnouncements/{announcementId}
 *     { roomId, message, authorName, createdAt }
 *
 * Port of js/management.js (`loadUnitAnnouncements`,
 * `handleUnitAnnouncement`) and the resident read path in js/dashboard.js
 * (`loadLatestUnitAnnouncement`).
 *
 * Rules: management can create (message must be 1..500 characters); a
 * resident can read announcements for the room on their own profile only.
 * Reactions: update/delete are always denied — so the mobile client never
 * offers editing or deleting an announcement.
 */

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";

/** All shared updates for a room, newest first (management + resident). */
export async function fetchAnnouncements(roomId) {
  if (!roomId) return [];
  const snapshot = await getDocs(
    query(
      collection(db, "unitAnnouncements"),
      where("roomId", "==", roomId),
      orderBy("createdAt", "desc")
    )
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Newest shared update for a room (resident dashboard card). */
export async function fetchLatestAnnouncement(roomId) {
  if (!roomId) return null;
  const snapshot = await getDocs(
    query(
      collection(db, "unitAnnouncements"),
      where("roomId", "==", roomId),
      orderBy("createdAt", "desc"),
      limit(1)
    )
  );
  if (snapshot.empty) return null;
  const [first] = snapshot.docs;
  return { id: first.id, ...first.data() };
}
