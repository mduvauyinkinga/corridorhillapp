/**
 * services/noteService.js
 * ------------------------------------------------------------------
 * Maintenance notes subcollection:
 *   complaints/{complaintId}/maintenanceNotes/{noteId}
 *     { text, authorId, authorName, createdAt }
 *
 * Port of the note handling in js/management.js (`loadNotes`,
 * `handleAddNote`) and the resident read path in js/tracking.js.
 *
 * Residents can READ notes on their own complaint but can never create or
 * edit them — this is enforced by firestore.rules and is preserved here:
 * the mobile app only exposes "add note" inside the management screens.
 */

import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../config/firebase";

/** All notes for a complaint, oldest first (management + resident read). */
export async function fetchNotes(complaintId) {
  if (!complaintId) return [];
  const snapshot = await getDocs(
    query(
      collection(db, "complaints", complaintId, "maintenanceNotes"),
      orderBy("createdAt", "asc")
    )
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Latest maintenance note for a complaint, or null.
 * Used by the resident dashboard's "Latest Maintenance Update" card and it
 * reads a single document (limit 1) exactly like js/dashboard.js so the
 * dashboard stays a single extra query.
 */
export async function fetchLatestNote(complaintId) {
  if (!complaintId) return null;
  const snapshot = await getDocs(
    query(
      collection(db, "complaints", complaintId, "maintenanceNotes"),
      orderBy("createdAt", "desc"),
      limit(1)
    )
  );
  if (snapshot.empty) return null;
  const [first] = snapshot.docs;
  return { id: first.id, ...first.data() };
}

/** Management only: add a maintenance note to a complaint. */
export async function addNote(complaintId, { text, authorId, authorName }) {
  if (!complaintId || !text) return;
  await addDoc(collection(db, "complaints", complaintId, "maintenanceNotes"), {
    text,
    authorId: authorId || null,
    authorName: authorName || "Management",
    createdAt: serverTimestamp(),
  });
}
