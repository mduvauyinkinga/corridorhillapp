/**
 * timeline.js
 * ------------------------------------------------------------------
 * Complaint timeline helpers.
 *
 * Every complaint keeps a chronological history in the
 * `complaints/{complaintId}/timeline/{eventId}` subcollection. Each
 * event records an action, a description, the responsible user, and a
 * timestamp so residents and management can see exactly what happened
 * and when.
 *
 * Provides:
 *   - addTimelineEvent()   : write a new event.
 *   - loadTimeline()       : read all events (ascending).
 *   - renderTimeline()     : build the timeline DOM.
 */

import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { formatDateTime, $ } from "./utils.js";

/**
 * Append a timeline event to a complaint.
 * @param {string} complaintId - The complaint document ID.
 * @param {object} event - { action, description, authorId, authorName, authorRole }.
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

/**
 * Load all timeline events for a complaint, oldest first.
 * Resolves to an array of { id, ...data } documents.
 */
export async function loadTimeline(complaintId) {
  const q = query(
    collection(db, "complaints", complaintId, "timeline"),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Render timeline events into a container element.
 * @param {HTMLElement} container - Target element (cleared before render).
 * @param {Array} events - Timeline event documents (from loadTimeline).
 */
export function renderTimeline(container, events) {
  if (!container) return;
  container.innerHTML = "";

  if (!events || events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "timeline__empty";
    empty.textContent = "No timeline events yet.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ol");
  list.className = "timeline-list";

  events.forEach((event) => {
    const item = document.createElement("li");
    item.className = "timeline-item";

    const dot = document.createElement("span");
    dot.className = "timeline-item__dot";
    dot.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "timeline-item__content";

    const title = document.createElement("div");
    title.className = "timeline-item__action";
    title.textContent = event.action || "Update";

    if (event.description) {
      const desc = document.createElement("div");
      desc.className = "timeline-item__desc";
      desc.textContent = event.description;
      content.appendChild(desc);
    }

    const meta = document.createElement("div");
    meta.className = "timeline-item__meta";
    const who = event.authorName || "System";
    const when = formatDateTime(event.createdAt);
    meta.textContent = `${who} · ${when}`;
    content.appendChild(meta);

    content.insertBefore(title, content.firstChild);
    item.appendChild(dot);
    item.appendChild(content);
    list.appendChild(item);
  });

  container.appendChild(list);
}
