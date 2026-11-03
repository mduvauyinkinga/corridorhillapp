/**
 * dashboard.js
 * ------------------------------------------------------------------
 * Resident dashboard (Phase 2.2).
 *
 * Displays the resident's room summary, complaint statistics, active
 * complaints, complaint history, the latest maintenance note, and a
 * quick "Submit complaint" action. Redirects management users to
 * management.html.
 *
 * Performance: the resident's complaints are fetched ONCE (single
 * query) and all statistics/lists are derived in-memory. The latest
 * maintenance note reads only the first note of the most recent active
 * complaint, avoiding N+1 queries.
 */

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireRole } from "./auth.js";
import { renderNav } from "./nav.js";
import { fetchResidentMessages, subscribeResidentMessages } from "./unit-messages.js";
import {
  formatDate,
  statusBadge,
  normalizeStatus,
  normalizePriority,
  priorityBadge,
  isOverdue,
  $,
} from "./utils.js";

const noRoomState = $("#no-room-state");
const dashboardState = $("#dashboard-state");
const unitMessagesContainer = $("#unit-messages");

function renderUnitMessages(unitMessages) {
  unitMessagesContainer.innerHTML = "";
  if (unitMessages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dashboard__list-empty";
    empty.textContent = "No messages for your unit yet.";
    unitMessagesContainer.appendChild(empty);
    return;
  }

  unitMessages.forEach((message) => {
    const item = document.createElement("div");
    item.className = "note-item";
    const text = document.createElement("div");
    text.className = "note-item__text";
    text.textContent = message.message || "";
    const meta = document.createElement("div");
    meta.className = "note-item__meta";
    const target = message.roomLetter ? `Room ${message.roomLetter}` : "Entire unit";
    meta.textContent = `${message.authorName || "Management"} · Block ${message.block} · Unit ${message.unitNumber} · ${target} · ${formatDate(message.createdAt)}`;
    item.append(text, meta);
    unitMessagesContainer.appendChild(item);
  });
}

/** Fetch the resident's complaints (cached for the whole page). */
async function loadComplaints(uid) {
  const q = query(
    collection(db, "complaints"),
    where("residentId", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Fetch the latest maintenance note for a single complaint. */
async function loadLatestNote(complaintId) {
  const q = query(
    collection(db, "complaints", complaintId, "maintenanceNotes"),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const note = snap.docs[0].data();
  return { id: snap.docs[0].id, ...note };
}

/** Fetch the newest shared update management has sent to this room. */
async function loadLatestUnitAnnouncement(roomId) {
  const q = query(
    collection(db, "unitAnnouncements"),
    where("roomId", "==", roomId),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/** Build a compact complaint card for the dashboard lists. */
function complaintCard(complaint) {
  const card = document.createElement("div");
  card.className = "complaint-card";

  const head = document.createElement("div");
  head.className = "complaint-card__head";

  const title = document.createElement("span");
  title.className = "complaint-card__title";
  title.textContent = complaint.category || "Complaint";

  const statusEl = document.createElement("span");
  const status = normalizeStatus(complaint.status);
  const badge = document.createElement("span");
  badge.className = statusBadge(status);
  badge.textContent = status;
  statusEl.appendChild(badge);

  head.appendChild(title);
  head.appendChild(statusEl);

  const meta = document.createElement("div");
  meta.className = "complaint-card__meta";
  const parts = [];
  if (Array.isArray(complaint.issues) && complaint.issues.length) {
    parts.push(complaint.issues.join(", "));
  }
  const priority = normalizePriority(complaint.priority);
  if (priority !== "Low" || complaint.priority) {
    const pBadge = document.createElement("span");
    pBadge.className = priorityBadge(priority);
    pBadge.textContent = priority;
    meta.appendChild(pBadge);
  }
  if (isOverdue(complaint)) {
    const ov = document.createElement("span");
    ov.className = "badge badge--overdue";
    ov.textContent = "Overdue";
    meta.appendChild(ov);
  }
  const dateSpan = document.createElement("span");
  dateSpan.textContent = ` · ${formatDate(complaint.createdAt)}`;
  meta.appendChild(dateSpan);

  card.appendChild(head);
  card.appendChild(meta);

  const detailsLink = document.createElement("a");
  detailsLink.className = "complaint-card__link";
  detailsLink.href = `tracking.html?complaintId=${encodeURIComponent(complaint.id)}`;
  detailsLink.textContent = "View details and messages";
  card.appendChild(detailsLink);
  return card;
}

async function renderDashboard(profile) {
  // Greeting.
  const firstName = profile.name ? profile.name.split(" ")[0] : "there";
  $("#greeting-name").textContent = `Hello, ${firstName}!`;
  $("#greeting-sub").textContent = "Here's your residence overview.";

  // Room summary (prefer denormalized fields; fallback to room/unit docs).
  let block = profile.block;
  let roomNumber = profile.roomNumber;
  let roomLetter = profile.roomLetter;
  if (
    (block == null || roomNumber == null || roomLetter == null) &&
    (profile.roomId || profile.unitId)
  ) {
    try {
      const roomSnap = await getDoc(doc(db, "rooms", profile.roomId));
      const unitSnap = profile.unitId
        ? await getDoc(doc(db, "units", profile.unitId))
        : null;
      const room = roomSnap.exists() ? roomSnap.data() : null;
      const unit = unitSnap && unitSnap.exists() ? unitSnap.data() : null;
      block = block ?? room?.block;
      roomNumber = roomNumber ?? room?.roomNumber;
      roomLetter = roomLetter ?? unit?.roomLetter ?? unit?.unitName;
    } catch (error) {
      console.error("[dashboard] room fallback error:", error);
    }
  }
  $("#summary-block").textContent = block ?? "—";
  $("#summary-room").textContent = roomNumber ?? "—";
  $("#summary-unit").textContent = roomLetter ?? "—";

  // Load complaints (single query).
  let complaints = [];
  try {
    complaints = await loadComplaints(profile.uid);
  } catch (error) {
    console.error("[dashboard] load complaints error:", error);
  }

  let unitMessages = [];
  try {
    unitMessages = await fetchResidentMessages(profile.uid);
  } catch (error) {
    console.error("[dashboard] load unit messages error:", error);
  }
  renderUnitMessages(unitMessages);

// Statistics.
  const active = complaints.filter(
    (c) =>
      normalizeStatus(c.status) !== "Completed" &&
      normalizeStatus(c.status) !== "Cancelled"
  );
  const inProgress = complaints.filter(
    (c) => normalizeStatus(c.status) === "In Progress"
  );
  const completed = complaints.filter(
    (c) => normalizeStatus(c.status) === "Completed"
  );
  const cancelled = complaints.filter(
    (c) => normalizeStatus(c.status) === "Cancelled"
  );
  $("#stat-total").textContent = complaints.length;
  $("#stat-active").textContent = active.length;
  $("#stat-inprogress").textContent = inProgress.length;
  $("#stat-completed").textContent = completed.length;

  // Active complaints list.
  const activeContainer = $("#active-complaints");
  activeContainer.innerHTML = "";
  if (active.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dashboard__list-empty";
    empty.textContent = "You have no active complaints. 🎉";
    activeContainer.appendChild(empty);
  } else {
    active.forEach((c) => activeContainer.appendChild(complaintCard(c)));
  }

  // Complaint history (all, newest first — already sorted).
  const historyContainer = $("#complaint-history");
  historyContainer.innerHTML = "";
  if (complaints.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dashboard__list-empty";
    empty.textContent = "You haven't submitted any complaints yet.";
    historyContainer.appendChild(empty);
  } else {
    complaints.forEach((c) => historyContainer.appendChild(complaintCard(c)));
  }

  // Latest maintenance update: include messages sent to everyone in the room,
  // even if this resident has never submitted a complaint.
  const latestNotes = $("#latest-notes");
  latestNotes.innerHTML = "";
  const target = active[0] || complaints[0];
  try {
    const [note, announcement] = await Promise.all([
      target ? loadLatestNote(target.id) : Promise.resolve(null),
      loadLatestUnitAnnouncement(profile.roomId),
    ]);
    const noteDate = note?.createdAt?.toMillis?.() || 0;
    const announcementDate = announcement?.createdAt?.toMillis?.() || 0;
    const latestUnitMessage = unitMessages[0] || null;
    const messageDate = latestUnitMessage?.createdAt?.toMillis?.() || 0;
    let update = note;
    if (announcementDate > (update?.createdAt?.toMillis?.() || 0)) {
      update = { ...announcement, isAnnouncement: true };
    }
    if (messageDate > Math.max(noteDate, announcementDate)) {
      update = { ...latestUnitMessage, isAnnouncement: true };
    }
    if (!update) {
      const empty = document.createElement("div");
      empty.className = "notes-list__empty";
      empty.textContent = "No maintenance updates yet.";
      latestNotes.appendChild(empty);
      return;
    }
    const item = document.createElement("div");
    item.className = "note-item";
    const text = document.createElement("div");
    text.className = "note-item__text";
    text.textContent = update.isAnnouncement ? update.message || "" : update.text || "";
    const meta = document.createElement("div");
    meta.className = "note-item__meta";
    meta.textContent = `${update.isAnnouncement ? "Unit Alerts" : update.authorName || "Management"} · ${formatDate(
      update.createdAt
    )}`;
    item.appendChild(text);
    item.appendChild(meta);
    latestNotes.appendChild(item);
  } catch (error) {
    console.error("[dashboard] latest note error:", error);
    const empty = document.createElement("div");
    empty.className = "notes-list__empty";
    empty.textContent = "Could not load the latest maintenance update.";
    latestNotes.appendChild(empty);
  }
}

async function init() {
  const profile = await requireRole(["resident"]);
  if (!profile) return; // Guard redirected.

  renderNav(profile);
  document.title = `Dashboard | ${profile.name}`;

  if (!profile.roomId) {
    noRoomState.classList.remove("hidden");
    dashboardState.classList.add("hidden");
    return;
  }

  dashboardState.classList.remove("hidden");
  subscribeResidentMessages(
    profile.uid,
    renderUnitMessages,
    (error) => console.error("[dashboard] unit inbox listener error:", error)
  );
  await renderDashboard(profile);
}

init();
