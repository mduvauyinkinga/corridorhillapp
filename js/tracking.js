/**
 * tracking.js
 * ------------------------------------------------------------------
 * Resident complaint tracking (Phase 2.2).
 *
 * Loads and displays ONLY the signed-in resident's complaints with
 * their current status, category, priority badge, room/unit, and a
 * details modal that shows the timeline, photos, completion dates,
 * maintenance notes, and a reopen request control.
 */

import { db, auth } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  orderBy,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireRole } from "./auth.js";
import { renderNav } from "./nav.js";
import { loadTimeline, renderTimeline, addTimelineEvent } from "./timeline.js";
import { setButtonLoading, getFirebaseErrorMessage } from "./utils.js";
import {
  formatDate,
  formatDateTime,
  statusBadge,
  normalizeStatus,
  normalizePriority,
  priorityBadge,
  isOverdue,
  COMPLAINT_STATUSES,
  toast,
  $,
} from "./utils.js";

const tbody = $("#tracking-body");
const loadingEl = $("#tracking-loading");
const emptyEl = $("#tracking-empty");

const modal = $("#complaint-modal");
const modalDetails = $("#modal-details");
const modalPhotos = $("#modal-photos");
const modalTimeline = $("#modal-timeline");
const modalNotes = $("#modal-notes");
const reopenBtn = $("#reopen-btn");
const reopenMsg = $("#reopen-msg");

// Edit modal refs
const editModal = $("#edit-modal");
const editForm = $("#edit-form");
const editCategory = $("#edit-category");
const editIssuesBox = $("#edit-issues-list");
const editNotes = $("#edit-notes");
const editSaveBtn = $("#edit-save-btn");
const editAlert = $("#edit-alert");

let editingComplaintId = null;

// The complaint currently open in the modal (from this page's data).
let activeComplaint = null;

// Cache resolved room/unit display labels across complaints. A resident
// has only one room and one unit, so this avoids N+1 reads.
const resolveCache = { room: {}, unit: {} };

/**
 * Resolve a room's display number and a unit name.
 * Falls back to the raw ID if the document can't be found. Results are
 * cached per page load to avoid duplicate Firestore reads.
 */
async function resolveRoomAndUnit(roomId, unitId) {
  let roomLabel = roomId || "—";
  let unitLabel = unitId || "—";

  try {
    if (roomId) {
      if (resolveCache.room[roomId]) {
        roomLabel = resolveCache.room[roomId];
      } else {
        const roomSnap = await getDoc(doc(db, "rooms", roomId));
        if (roomSnap.exists()) {
          roomLabel = roomSnap.data().roomNumber ?? roomId;
        }
        resolveCache.room[roomId] = roomLabel;
      }
    }
    if (unitId) {
      if (resolveCache.unit[unitId]) {
        unitLabel = resolveCache.unit[unitId];
      } else {
        const unitSnap = await getDoc(doc(db, "units", unitId));
        if (unitSnap.exists()) {
          unitLabel = unitSnap.data().unitName ?? unitId;
        }
        resolveCache.unit[unitId] = unitLabel;
      }
    }
  } catch (error) {
    console.warn("[tracking] Could not resolve room/unit:", error);
  }

  return { roomLabel, unitLabel };
}

/* ------------------------------ Detail modal ------------------------------ */

function formatDateValue(value) {
  if (!value) return "—";
  return formatDate(value);
}

function openComplaintModal(complaint, roomLabel, unitLabel) {
  activeComplaint = complaint;

  // Details grid.
  modalDetails.innerHTML = "";
  const overdue = isOverdue(complaint);
  const priority = normalizePriority(complaint.priority);

  // Priority badge element.
  const priorityWrap = document.createElement("div");
  priorityWrap.className = "priority-wrap";
  const priorityBadgeEl = document.createElement("span");
  priorityBadgeEl.className = priorityBadge(priority);
  priorityBadgeEl.textContent = priority;
  priorityWrap.appendChild(priorityBadgeEl);
  if (overdue) {
    const ov = document.createElement("span");
    ov.className = "badge badge--overdue";
    ov.textContent = "Overdue";
    priorityWrap.appendChild(ov);
  }

  const items = [
    ["Issues", Array.isArray(complaint.issues) ? complaint.issues.join(", ") : String(complaint.issues || "—")],
    ["Category", complaint.category || "—"],
    ["Priority", priorityWrap],
    ["Room", roomLabel],
    ["Unit", unitLabel],
    ["Current Status", normalizeStatus(complaint.status)],
    ["Date Submitted", formatDateValue(complaint.createdAt)],
    ["Estimated Completion", formatDateValue(complaint.estimatedCompletion)],
    ["Actual Completion", formatDateValue(complaint.actualCompletion)],
    ["Notes", complaint.notes || "—"],
  ];

  items.forEach(([label, value]) => {
    const div = document.createElement("div");
    div.className = "detail-grid__item";
    const l = document.createElement("div");
    l.className = "detail-grid__label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "detail-grid__value";
    if (value instanceof Node) {
      v.appendChild(value);
    } else {
      v.textContent = value || "—";
    }
    div.appendChild(l);
    div.appendChild(v);
    modalDetails.appendChild(div);
  });

  // Photos.
  renderPhotos(complaint.photoURLs);

  // Timeline.
  modalTimeline.innerHTML = '<div class="timeline__empty">Loading timeline…</div>';
  loadTimeline(complaint.id)
    .then((events) => renderTimeline(modalTimeline, events))
    .catch((error) => {
      console.error("[tracking] loadTimeline error:", error);
      modalTimeline.innerHTML = '<div class="timeline__empty">Could not load timeline.</div>';
    });

  // Notes.
  loadNotes(complaint.id).then((notes) => {
    modalNotes.innerHTML = "";
    if (notes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "notes-list__empty";
      empty.textContent = "No maintenance notes yet.";
      modalNotes.appendChild(empty);
      return;
    }
    notes.forEach((note) => {
      const item = document.createElement("div");
      item.className = "note-item";
      const text = document.createElement("div");
      text.className = "note-item__text";
      text.textContent = note.text || "";
      const meta = document.createElement("div");
      meta.className = "note-item__meta";
      meta.textContent = `${note.authorName || "Management"} · ${formatDate(note.createdAt)}`;
      item.appendChild(text);
      item.appendChild(meta);
      modalNotes.appendChild(item);
    });
  });

  // Reopen control.
  const status = normalizeStatus(complaint.status);
  if (status === "Completed") {
    if (complaint.reopenRequested) {
      reopenBtn.classList.add("hidden");
      reopenMsg.textContent =
        complaint.reopenStatus === "Approved"
          ? "Your reopen request was approved. The complaint is now In Progress."
          : complaint.reopenStatus === "Rejected"
          ? "Your reopen request was rejected. The complaint remains completed."
          : "Your reopen request is waiting for management review.";
    } else {
      reopenBtn.classList.remove("hidden");
      reopenMsg.textContent =
        "If you believe this complaint was not fully resolved, you can request to reopen it.";
    }
  } else if (status === "In Progress" && complaint.reopenRequested) {
    reopenBtn.classList.add("hidden");
    reopenMsg.textContent = "This complaint was reopened and is In Progress.";
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function renderPhotos(urls) {
  modalPhotos.innerHTML = "";
  if (!Array.isArray(urls) || urls.length === 0) {
    const empty = document.createElement("div");
    empty.className = "photo-emptyr";
    empty.textContent = "No photos attached.";
    modalPhotos.appendChild(empty);
    return;
  }
  urls.forEach((url) => {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "photo-gallery__item";
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Complaint photo";
    img.loading = "lazy";
    link.appendChild(img);
    modalPhotos.appendChild(link);
  });
}

async function loadNotes(complaintId) {
  const q = query(
    collection(db, "complaints", complaintId, "maintenanceNotes"),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  activeComplaint = null;
}

/* ------------------------------ Reopen logic ------------------------------ */

async function handleReopen() {
  if (!activeComplaint) return;
  reopenBtn.disabled = true;
  try {
    await updateDoc(doc(db, "complaints", activeComplaint.id), {
      reopenRequested: true,
      reopenStatus: "Pending",
      updatedAt: serverTimestamp(),
    });
    activeComplaint.reopenRequested = true;
    activeComplaint.reopenStatus = "Pending";
    toast("Reopen request submitted for management review.", "success");
    closeModal();
  } catch (error) {
    console.error("[tracking] reopen error:", error);
    toast("Could not submit the reopen request. Please try again.", "error");
    reopenBtn.disabled = false;
  }
}

/* ------------------------------ Edit logic -------------------------------- */

function openEditModal(complaint) {
  editingComplaintId = complaint.id;
  editCategory.value = complaint.category || "";
  editNotes.value = complaint.notes || "";

  // Check the complaint's existing issues.
  const selected = Array.isArray(complaint.issues) ? complaint.issues : [];
  editIssuesBox.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = selected.includes(cb.value);
  });

  if (editAlert) editAlert.hidden = true;
  editModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

async function handleEditSubmit(event) {
  event.preventDefault();
  if (!editingComplaintId) return;

  const category = editCategory.value;
  const issues = Array.from(
    editIssuesBox.querySelectorAll('input[type="checkbox"]:checked')
  ).map((cb) => cb.value);

  // Clear previous errors.
  const catErr = document.querySelector('[data-error="editCategory"]');
  const issErr = document.querySelector('[data-error="editIssues"]');
  if (catErr) catErr.textContent = "";
  if (issErr) issErr.textContent = "";

  if (!category) {
    if (catErr) catErr.textContent = "Please select a category.";
    return;
  }
  if (issues.length === 0) {
    if (issErr) issErr.textContent = "Please select at least one issue.";
    return;
  }

  const notes = editNotes.value.trim();
  const restore = setButtonLoading(editSaveBtn, "Saving…");

  try {
    const user = auth.currentUser;
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : null;

    await updateDoc(doc(db, "complaints", editingComplaintId), {
      category,
      issues,
      notes,
      updatedAt: serverTimestamp(),
    });

    await addTimelineEvent(editingComplaintId, {
      action: "Complaint Edited",
      description: `Category: ${category}. Issues: ${issues.join(", ")}`,
      authorId: user.uid,
      authorName: profile?.name || "Resident",
      authorRole: "resident",
    });

    toast("Complaint updated successfully!", "success");
    closeEditModal();
    // Reload the tracking table to reflect changes.
    loadingEl.classList.remove("hidden");
    tbody.innerHTML = "";
    emptyEl.classList.add("hidden");
    await loadComplaints({ uid: user.uid });
  } catch (error) {
    console.error("[tracking] edit error:", error);
    if (editAlert) {
      editAlert.textContent = getFirebaseErrorMessage(error);
      editAlert.hidden = false;
    }
  } finally {
    restore();
  }
}

function closeEditModal() {
  editModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  editingComplaintId = null;
}

/* ------------------------------ Cancel logic ------------------------------ */

async function handleCancel(complaint) {
  const status = normalizeStatus(complaint.status);
  if (status !== "Submitted" && status !== "Received") {
    toast("This complaint can no longer be cancelled.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to cancel this complaint? This cannot be undone."
  );
  if (!confirmed) return;

  try {
    const user = auth.currentUser;
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : null;

    await updateDoc(doc(db, "complaints", complaint.id), {
      status: "Cancelled",
      updatedAt: serverTimestamp(),
    });

    await addTimelineEvent(complaint.id, {
      action: "Complaint Cancelled",
      description: "The resident cancelled this complaint.",
      authorId: user.uid,
      authorName: profile?.name || "Resident",
      authorRole: "resident",
    });

    toast("Complaint cancelled.", "info");
    loadingEl.classList.remove("hidden");
    tbody.innerHTML = "";
    emptyEl.classList.add("hidden");
    await loadComplaints({ uid: user.uid });
  } catch (error) {
    console.error("[tracking] cancel error:", error);
    toast("Could not cancel the complaint. Please try again.", "error");
  }
}

/* ------------------------------ Table loading ------------------------------ */

async function loadComplaints(profile) {
  try {
    const q = query(
      collection(db, "complaints"),
      where("residentId", "==", profile.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);

    loadingEl.classList.add("hidden");

    if (snap.empty) {
      emptyEl.classList.remove("hidden");
      return;
    }

    for (const docSnap of snap.docs) {
      const data = { id: docSnap.id, ...docSnap.data() };
      const { roomLabel, unitLabel } = await resolveRoomAndUnit(
        data.roomId,
        data.unitId
      );

      const tr = document.createElement("tr");
      if (isOverdue(data)) tr.className = "is-overdue";

      const issueCell = document.createElement("td");
      issueCell.textContent = Array.isArray(data.issues) ? data.issues.join(", ") : String(data.issues || "—");

      const catCell = document.createElement("td");
      catCell.textContent = data.category || "—";

      const priorityCell = document.createElement("td");
      const priority = normalizePriority(data.priority);
      const priorityBadgeEl = document.createElement("span");
      priorityBadgeEl.className = priorityBadge(priority);
      priorityBadgeEl.textContent = priority;
      priorityCell.appendChild(priorityBadgeEl);

      const roomCell = document.createElement("td");
      roomCell.textContent = roomLabel;

      const unitCell = document.createElement("td");
      unitCell.textContent = unitLabel;

      const dateCell = document.createElement("td");
      dateCell.textContent = formatDate(data.createdAt);

      const statusCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = statusBadge(data.status);
      badge.textContent = normalizeStatus(data.status) || "Submitted";
      statusCell.appendChild(badge);

      // Actions: View button.
      const actionsCell = document.createElement("td");
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn btn--ghost btn--sm";
      viewBtn.textContent = "View";
      viewBtn.setAttribute(
        "aria-label",
        `View complaint ${data.id.slice(0, 8).toUpperCase()}`
      );
      viewBtn.addEventListener("click", () =>
        openComplaintModal(data, roomLabel, unitLabel)
      );
actionsCell.appendChild(viewBtn);

      // Manage: Edit + Cancel (only when editable).
      const manageCell = document.createElement("td");
      const status = normalizeStatus(data.status);
      const editable = status === "Submitted" || status === "Received";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--primary btn--sm btn--table-action";
      editBtn.textContent = "Edit";
      editBtn.disabled = !editable;
      editBtn.setAttribute("aria-label", `Edit complaint ${data.id.slice(0, 8).toUpperCase()}`);
      editBtn.addEventListener("click", () => openEditModal(data));
      manageCell.appendChild(editBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn--ghost btn--sm btn--danger btn--table-action";
      cancelBtn.textContent = "Cancel";
      cancelBtn.disabled = !editable;
      cancelBtn.setAttribute("aria-label", `Cancel complaint ${data.id.slice(0, 8).toUpperCase()}`);
      cancelBtn.addEventListener("click", () => handleCancel(data));
      manageCell.appendChild(cancelBtn);

      tr.appendChild(issueCell);
      tr.appendChild(catCell);
      tr.appendChild(priorityCell);
      tr.appendChild(roomCell);
      tr.appendChild(unitCell);
      tr.appendChild(dateCell);
      tr.appendChild(statusCell);
      tr.appendChild(actionsCell);
      tr.appendChild(manageCell);
      tbody.appendChild(tr);
    }
  } catch (error) {
    console.error("[tracking] load error:", error);
    loadingEl.classList.add("hidden");
    emptyEl.textContent = "Could not load your complaints. Please try again.";
    emptyEl.classList.remove("hidden");
  }
}

/* ------------------------------ Init & wiring ------------------------------ */

reopenBtn.addEventListener("click", handleReopen);
document.querySelectorAll("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

// Edit modal wiring.
if (editForm) editForm.addEventListener("submit", handleEditSubmit);
document.querySelectorAll("[data-close-edit-modal]").forEach((el) => {
  el.addEventListener("click", closeEditModal);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  if (e.key === "Escape" && editModal && !editModal.classList.contains("hidden")) {
    closeEditModal();
  }
});

async function init() {
  const profile = await requireRole(["resident"]);
  if (!profile) return;

  renderNav(profile);
  await loadComplaints(profile);
}

init();
