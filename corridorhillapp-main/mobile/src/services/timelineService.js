/**
 * services/timelineService.js
 * ------------------------------------------------------------------
 * Port of the website's `js/timeline.js`.
 *
 * Every complaint keeps a chronological history in
 *   complaints/{complaintId}/timeline/{eventId}
 * with { action, description, authorId, authorName, authorRole, createdAt }.
 *
 * The mobile client writes the SAME event shapes and the same actions as
 * the website, so a timeline is readable and consistent in both clients.
 */

import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../config/firebase";

/**
 * Append a timeline event to a complaint (defaults match js/timeline.js).
 * Firestore rules allow this for management, and for the resident who owns
 * the complaint — the same boundary the website works within.
 */
export async function addTimelineEvent(complaintId, event) {
  if (!complaintId) return;
  await addDoc(collection(db, "complaints", complaintId, "timeline"), {
    action: event.action || "Update",
    description: event.description || "",
    authorId: event.authorId || null,
    authorName: event.authorName || "System",
    authorRole: event.authorRole || "system",
    createdAt: serverTimestamp(),
  });
}

/** Load every timeline event of a complaint, oldest first. */
export async function fetchTimeline(complaintId) {
  if (!complaintId) return [];
  const snapshot = await getDocs(
    query(
      collection(db, "complaints", complaintId, "timeline"),
      orderBy("createdAt", "asc")
    )
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
