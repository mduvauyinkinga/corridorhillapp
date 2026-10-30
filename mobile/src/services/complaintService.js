/**
 * services/complaintService.js
 * ------------------------------------------------------------------
 * All complaint reads and writes.
 *
 * Port of:
 *   - js/complaints.js  (submit a complaint + first timeline event)
 *   - js/tracking.js    (my complaints, edit, cancel, reopen request)
 *   - js/management.js  (status, priority, completion dates, reopen decision)
 *
 * Field names, default values and timestamps are identical to the website:
 *   residentId, roomId, unitId, issues[], category, priority, photoURLs[],
 *   notes, status, reopenRequested, reopenStatus, estimatedCompletion,
 *   actualCompletion, createdAt, updatedAt
 *
 * Nothing here changes the shared data model or bypasses rules:
 *   - a resident creates a complaint with their own residentId only,
 *   - a resident can edit category/issues/notes while the status is
 *     unchanged, or cancel from Submitted/Received (rule-allowed),
 *   - status, priority, completion dates and reopen decisions are
 *     management-only operations, exactly as in the web client.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";
import { DEFAULT_PRIORITY, DEFAULT_STATUS } from "../utils/complaints";
import { addTimelineEvent } from "./timelineService";

/* ------------------------------- Reads ---------------------------------- */

/** The signed-in resident's own complaints, newest first (composite index). */
export async function fetchResidentComplaints(uid) {
  if (!uid) return [];
  const snapshot = await getDocs(
    query(
      collection(db, "complaints"),
      where("residentId", "==", uid),
      orderBy("createdAt", "desc")
    )
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Every complaint (management bulk read — one query for the whole table). */
export async function fetchAllComplaints() {
  const snapshot = await getDocs(collection(db, "complaints"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * A single complaint by id (used when a screen is opened from a list and
 * needs the freshest copy — e.g. after an edit or a management update).
 */
export async function fetchComplaint(complaintId) {
  if (!complaintId) return null;
  const snapshot = await getDoc(doc(db, "complaints", complaintId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/* --------------------------- Resident writes ---------------------------- */

/**
 * Create a complaint using the exact js/complaints.js payload, then record
 * the initial "Complaint Submitted" timeline event.
 *
 * The residents' create rule only requires
 * `request.resource.data.residentId == request.auth.uid`, which this call
 * satisfies — the mobile client has no elevated privileges.
 */
export async function createComplaint({
  uid,
  profile,
  category,
  issues,
  notes,
  photoURLs = [],
}) {
  const payload = {
    residentId: uid,
    roomId: profile?.roomId || null,
    unitId: profile?.unitId || null,
    issues,
    category,
    priority: DEFAULT_PRIORITY,
    photoURLs,
    notes: notes || "",
    status: DEFAULT_STATUS,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const complaintRef = await addDoc(collection(db, "complaints"), payload);

  await addTimelineEvent(complaintRef.id, {
    action: "Complaint Submitted",
    description: `Category: ${category}. Issues: ${issues.join(", ")}`,
    authorId: uid,
    authorName: profile?.name || "Resident",
    authorRole: "resident",
  });

  return complaintRef.id;
}

/**
 * Resident edit: category, issues and notes only.
 * The status is deliberately untouched so the Firestore update rule
 * (`request.resource.data.status == resource.data.status`) still holds.
 */
export async function updateComplaintDetails(
  complaintId,
  { category, issues, notes, authorId, authorName }
) {
  await updateDoc(doc(db, "complaints", complaintId), {
    category,
    issues,
    notes,
    updatedAt: serverTimestamp(),
  });

  await addTimelineEvent(complaintId, {
    action: "Complaint Edited",
    description: `Category: ${category}. Issues: ${issues.join(", ")}`,
    authorId,
    authorName: authorName || "Resident",
    authorRole: "resident",
  });
}

/**
 * Resident cancel. The Firestore rule allows ONLY `status` + `updatedAt`
 * to change, and only from Submitted/Received — the UI guards the same.
 */
export async function cancelComplaint(complaintId, { authorId, authorName }) {
  await updateDoc(doc(db, "complaints", complaintId), {
    status: "Cancelled",
    updatedAt: serverTimestamp(),
  });

  await addTimelineEvent(complaintId, {
    action: "Complaint Cancelled",
    description: "The resident cancelled this complaint.",
    authorId,
    authorName: authorName || "Resident",
    authorRole: "resident",
  });
}

/**
 * Resident reopen request for a Completed complaint.
 * Matches js/tracking.js `handleReopen` exactly: only these three fields are
 * written and no timeline event is created (the website creates none).
 */
export async function requestReopen(complaintId) {
  await updateDoc(doc(db, "complaints", complaintId), {
    reopenRequested: true,
    reopenStatus: "Pending",
    updatedAt: serverTimestamp(),
  });
}

/* -------------------------- Management writes --------------------------- */

/** Management: change the workflow status (+ timeline event). */
export async function updateStatus(complaintId, status, actor) {
  await updateDoc(doc(db, "complaints", complaintId), {
    status,
    updatedAt: serverTimestamp(),
  });

  await addTimelineEvent(complaintId, {
    action: `Status → ${status}`,
    description: `Management updated the complaint status to "${status}".`,
    authorId: actor?.uid || null,
    authorName: actor?.name || "Management",
    authorRole: "management",
  });
}

/** Management: assign a priority (+ timeline event). */
export async function updatePriority(complaintId, priority, actor) {
  await updateDoc(doc(db, "complaints", complaintId), {
    priority,
    updatedAt: serverTimestamp(),
  });

  await addTimelineEvent(complaintId, {
    action: `Priority set to ${priority}`,
    description: `Management assigned a "${priority}" priority.`,
    authorId: actor?.uid || null,
    authorName: actor?.name || "Management",
    authorRole: "management",
  });
}

/**
 * Management: estimated + actual completion dates.
 * The website writes `new Date(`${value}T00:00:00`)` or null and adds one
 * timeline event per date that was filled in — reproduced exactly.
 */
export async function updateCompletionDates(
  complaintId,
  { estimatedCompletion, actualCompletion, actor }
) {
  await updateDoc(doc(db, "complaints", complaintId), {
    estimatedCompletion,
    actualCompletion,
    updatedAt: serverTimestamp(),
  });

  if (estimatedCompletion) {
    const value = estimatedCompletion.toISOString().slice(0, 10);
    await addTimelineEvent(complaintId, {
      action: "Estimated completion set",
      description: `Management estimated completion by ${value}.`,
      authorId: actor?.uid || null,
      authorName: actor?.name || "Management",
      authorRole: "management",
    });
  }

  if (actualCompletion) {
    const value = actualCompletion.toISOString().slice(0, 10);
    await addTimelineEvent(complaintId, {
      action: "Actual completion recorded",
      description: `Management recorded actual completion on ${value}.`,
      authorId: actor?.uid || null,
      authorName: actor?.name || "Management",
      authorRole: "management",
    });
  }
}

/**
 * Management: approve a reopen request → back to "In Progress"
 * (js/management.js `handleReopenDecision(true)`).
 */
export async function approveReopen(complaintId, actor) {
  await updateDoc(doc(db, "complaints", complaintId), {
    status: "In Progress",
    reopenStatus: "Approved",
    updatedAt: serverTimestamp(),
  });

  await addTimelineEvent(complaintId, {
    action: "Reopen Approved",
    description: "Management approved the reopen request. Complaint moved to In Progress.",
    authorId: actor?.uid || null,
    authorName: actor?.name || "Management",
    authorRole: "management",
  });
}

/** Management: reject a reopen request (the complaint stays Completed). */
export async function rejectReopen(complaintId, actor) {
  await updateDoc(doc(db, "complaints", complaintId), {
    reopenStatus: "Rejected",
    updatedAt: serverTimestamp(),
  });

  await addTimelineEvent(complaintId, {
    action: "Reopen Rejected",
    description: "Management rejected the reopen request. Complaint remains completed.",
    authorId: actor?.uid || null,
    authorName: actor?.name || "Management",
    authorRole: "management",
  });
}
