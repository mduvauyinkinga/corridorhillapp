/**
 * utils/complaints.js
 * ------------------------------------------------------------------
 * Complaint domain constants and normalisers.
 *
 * This is a direct port of the shared logic in the website's
 * `js/utils.js` (COMPLAINT_STATUSES, COMPLAINT_CATEGORIES, PRIORITIES,
 * normalizeStatus, normalizePriority, isOverdue) plus the issue list and
 * the workflow guards used by `js/complaints.js` and `js/tracking.js`.
 *
 * The strings MUST stay identical to the website: they are persisted in
 * Firestore (`complaints.status`, `.priority`, `.category`, `.issues`) and
 * are shared with the web client.
 */

/** Valid complaint statuses, in workflow order (js/utils.js). */
export const COMPLAINT_STATUSES = [
  "Submitted",
  "Received",
  "Assigned",
  "In Progress",
  "Waiting for Parts",
  "Completed",
  "Cancelled",
];

/** Valid complaint categories (js/utils.js + complaint.html). */
export const COMPLAINT_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "Furniture",
  "Appliances",
  "Security",
  "Windows & Doors",
  "Cleaning",
  "Other",
];

/** Valid priority levels, in severity order (js/utils.js). */
export const PRIORITIES = ["Low", "Medium", "High", "Emergency"];

/** Checkbox issue list (complaint.html + the edit form in tracking.html). */
export const COMPLAINT_ISSUES = [
  "Toilet light",
  "Stove",
  "Fridge",
  "Door",
  "Window",
  "Shower",
  "Water leak",
  "Electrical",
  "Other",
];

/** Default status for a newly submitted complaint (js/complaints.js). */
export const DEFAULT_STATUS = "Submitted";

/** Default priority for a newly submitted complaint (js/complaints.js). */
export const DEFAULT_PRIORITY = "Low";

/**
 * Normalise a stored complaint status for display.
 * Legacy "Pending" maps to "Submitted"; unknown values fall back to
 * "Submitted" — identical to the website helper.
 */
export function normalizeStatus(status) {
  if (status === "Pending") return "Submitted";
  return status && COMPLAINT_STATUSES.includes(status) ? status : "Submitted";
}

/** Normalise a stored priority for display. Unknown/missing → "Low". */
export function normalizePriority(priority) {
  return priority && PRIORITIES.includes(priority) ? priority : "Low";
}

/**
 * Residents may edit their own complaint only while it is still in one of
 * the two early workflow states (tracking.js `editable`).
 */
export function isEditableStatus(status) {
  const s = normalizeStatus(status);
  return s === "Submitted" || s === "Received";
}

/**
 * Residents may cancel only from "Submitted" or "Received" — this mirrors
 * both `js/tracking.js` AND the update branch of `firestore.rules`.
 */
export function isCancellableStatus(status) {
  const s = normalizeStatus(status);
  return s === "Submitted" || s === "Received";
}

/** A complaint counts as "active" unless it is Completed or Cancelled. */
export function isActiveStatus(status) {
  const s = normalizeStatus(status);
  return s !== "Completed" && s !== "Cancelled";
}

/** Display helper: management shows the first 8 chars of the document id. */
export function shortComplaintId(id) {
  return id ? String(id).slice(0, 8).toUpperCase() : "—";
}

/** Join an issues array for display exactly like the website does. */
export function formatIssues(issues) {
  if (Array.isArray(issues)) return issues.join(", ");
  return issues ? String(issues) : "—";
}
