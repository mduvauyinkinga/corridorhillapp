/**
 * management.js
 * ------------------------------------------------------------------
 * Management dashboard logic (Phase 2.1).
 *
 * - Guarded to the `management` role only.
 * - Loads users, rooms, units and complaints once (cached in memory)
 *   and derives all statistics, search, filters, sorting and drill-downs
 *   client-side to avoid unnecessary Firestore reads (no N+1).
 * - Complaint details modal with a 6-step status workflow and a
 *   `complaints/{id}/maintenanceNotes` subcollection for notes.
 * - Searchable Residents and Unit Profiles views.
 */

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  addDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireRole } from "./auth.js";
import { renderNav } from "./nav.js";
import { loadTimeline, renderTimeline, addTimelineEvent } from "./timeline.js";
import { fetchUnitMessages, sendUnitMessage } from "./unit-messages.js";
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

/* ------------------------------ State cache ------------------------------ */

// Cached collections (fetched once). Maps enable O(1) joins.
let usersMap = {};    // uid -> user doc
let roomsMap = {};    // roomId -> room doc
let unitsMap = {};    // unitId -> unit doc
let unitsByRoom = {}; // roomId -> [unit docs]
let complaints = [];  // [{ id, ...data }]

let currentProfile = null;
let activeComplaintId = null; // currently open in the modal
let selectedBlock = ""; // block letter selected in unit profiles block picker

/**
 * Return the current bed slots for one parent room.  Modern data has two
 * slots (bed 1 and 2) for each lettered sub-room.  If a migration left the
 * old single-slot documents behind, prefer the modern slots so they cannot
 * inflate capacity in the management dashboard.
 */
function getRoomBedSlots(units) {
  const byLetter = new Map();

  units.forEach((unit) => {
    const letter = unit.roomLetter || unit.unitName;
    if (!letter) return;
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter).push(unit);
  });

  return Array.from(byLetter.values()).flatMap((letterUnits) => {
    const modernSlots = letterUnits
      .filter((unit) => unit.bedNumber === 1 || unit.bedNumber === 2)
      .sort((a, b) => a.bedNumber - b.bedNumber);

    // A migrated letter has exactly these two slots.  Old records are used
    // only as a fallback for databases that have not yet been migrated.
    return modernSlots.length > 0 ? modernSlots : letterUnits.slice(0, 1);
  });
}

/** Group bed slots into the three resident sub-rooms (A, B and C). */
function getSubRooms(units) {
  const groups = new Map();
  getRoomBedSlots(units).forEach((slot) => {
    const letter = slot.roomLetter || slot.unitName || "?";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(slot);
  });
  return Array.from(groups.entries())
    .map(([letter, slots]) => ({ letter, slots }))
    .sort((a, b) => a.letter.localeCompare(b.letter));
}

/* ------------------------------ DOM refs --------------------------------- */

const complaintsBody = $("#complaints-body");
const complaintsLoading = $("#complaints-loading");
const complaintsEmpty = $("#complaints-empty");

const residentsGrid = $("#residents-grid");
const residentsLoading = $("#residents-loading");
const residentsEmpty = $("#residents-empty");





const unitsGrid = $("#units-grid");
const unitsEmpty = $("#units-empty");
const unitSearch = $("#unit-search");
const unitStatus = $("#unit-status");
const unitsToolbar = $("#units-toolbar");
const unitsBlockPicker = $("#units-block-picker");
const unitsBlockGrid = $("#units-block-grid");
const unitsBlockView = $("#units-block-view");
const unitsBlockTitle = $("#units-block-title");
const unitsBack = $("#units-back");

const unitModal = $("#unit-modal");
const unitModalTitle = $("#unit-modal-title");
const unitModalSummary = $("#unit-modal-summary");
const unitModalResidents = $("#unit-modal-residents");
const unitModalComplaints = $("#unit-modal-complaints");
const unitModalAnnouncements = $("#unit-modal-announcements");
const unitAnnouncementForm = $("#unit-announcement-form");
const unitAnnouncementInput = $("#unit-announcement-input");
const unitAnnouncementTarget = $("#unit-announcement-target");
const unitAnnouncementSubmit = $("#unit-announcement-submit");
let activeUnitRoomId = null;

const tabOverviewBtn = $("#tab-overview");
const tabComplaintsBtn = $("#tab-complaints");
const tabResidentsBtn = $("#tab-residents");
const tabUnitsBtn = $("#tab-units");
const viewOverview = $("#view-overview");
const viewComplaints = $("#view-complaints");
const viewResidents = $("#view-residents");
const viewUnits = $("#view-units");

const searchInput = $("#search-input");
const filterStatus = $("#filter-status");
const filterCategory = $("#filter-category");
const filterBlock = $("#filter-block");
const filterFloor = $("#filter-floor");
const filterDate = $("#filter-date");
const sortBy = $("#sort-by");

const residentSearch = $("#resident-search");


const modal = $("#complaint-modal");
const modalDetails = $("#modal-details");
const modalStatusBadge = $("#modal-status-badge");
const modalStatusSelect = $("#modal-status-select");
const modalPrioritySelect = $("#modal-priority-select");
const modalEstimated = $("#modal-estimated");
const modalActual = $("#modal-actual");
const modalPhotos = $("#modal-photos");
const modalTimeline = $("#modal-timeline");
const reopenReview = $("#reopen-review");

const notesList = $("#notes-list");
const noteForm = $("#note-form");
const noteInput = $("#note-input");
const noteSubmit = $("#note-submit");

/* ------------------------------ Data loading ----------------------------- */

/**
 * Fetch all four collections in parallel and cache them in memory.
 * This is the ONLY bulk Firestore read; everything else is derived.
 */
async function loadAllData() {
  complaintsLoading.classList.remove("hidden");
  residentsLoading.classList.remove("hidden");

  const [usersSnap, roomsSnap, unitsSnap, complaintsSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "rooms")),
    getDocs(collection(db, "units")),
    getDocs(collection(db, "complaints")),
  ]);

  usersMap = {};
  usersSnap.docs.forEach((d) => {
    usersMap[d.id] = { uid: d.id, ...d.data() };
  });

  roomsMap = {};
  roomsSnap.docs.forEach((d) => {
    roomsMap[d.id] = { id: d.id, ...d.data() };
  });

  unitsMap = {};
  unitsByRoom = {};
  unitsSnap.docs.forEach((d) => {
    const unit = { id: d.id, ...d.data() };
    unitsMap[unit.id] = unit;
    if (!unitsByRoom[unit.roomId]) unitsByRoom[unit.roomId] = [];
    unitsByRoom[unit.roomId].push(unit);
  });

  complaints = complaintsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  complaintsLoading.classList.add("hidden");
  residentsLoading.classList.add("hidden");
}

/**
 * Repair bed slots left occupied by a resident profile that was deleted
 * directly in Firestore. Normally the Cloud Function in functions/index.js
 * does this immediately; this is a management-dashboard fallback for any
 * records deleted before that function was deployed.
 */
async function releaseOrphanedUnits() {
  const orphanedUnits = Object.values(unitsMap).filter(
    (unit) => unit.occupied === true
      && unit.residentId
      && !usersMap[unit.residentId]
  );

  if (orphanedUnits.length === 0) return 0;

  // Firestore batches permit at most 500 writes.
  for (let start = 0; start < orphanedUnits.length; start += 500) {
    const batch = writeBatch(db);
    orphanedUnits.slice(start, start + 500).forEach((unit) => {
      batch.update(doc(db, "units", unit.id), {
        occupied: false,
        residentId: null,
      });
    });
    await batch.commit();
  }

  // Keep this render's cache consistent with the successful writes.
  orphanedUnits.forEach((unit) => {
    unit.occupied = false;
    unit.residentId = null;
  });

  return orphanedUnits.length;
}

/* --------------------------- Lookup helpers ------------------------------ */

function getResident(uid) {
  return usersMap[uid] || null;
}

function getRoomOf(complaint) {
  const roomId = complaint.roomId;
  return (roomId && roomsMap[roomId]) || null;
}

function getUnitOf(complaint) {
  // Prefer the denormalized unitId; fall back to the first unit of the room.
  if (complaint.unitId && unitsMap[complaint.unitId]) {
    return unitsMap[complaint.unitId];
  }
  const room = getRoomOf(complaint);
  if (room && unitsByRoom[room.id] && unitsByRoom[room.id].length > 0) {
    return unitsByRoom[room.id][0];
  }
  return null;
}

/** Resolve all display fields for a complaint row/card. */
function resolveComplaintRow(c) {
  const resident = getResident(c.residentId);
  const room = getRoomOf(c);
  const unit = getUnitOf(c);

  return {
    id: c.id,
    shortId: c.id ? c.id.slice(0, 8).toUpperCase() : "—",
    name: resident?.name || "Unknown",
    studentNumber: resident?.studentNumber || "—",
    email: resident?.email || "",
    block: unit?.block || room?.block || "—",
    roomNumber: unit?.roomNumber ?? room?.roomNumber ?? "—",
    roomLetter: unit?.roomLetter || unit?.unitName || "—",
issues: Array.isArray(c.issues) ? c.issues.join(", ") : String(c.issues || "—"),
    status: normalizeStatus(c.status),
    category: c.category || "—",
    priority: normalizePriority(c.priority),
    photoURLs: Array.isArray(c.photoURLs) ? c.photoURLs : [],
    estimatedCompletion: c.estimatedCompletion || null,
    actualCompletion: c.actualCompletion || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    notes: c.notes || "",
    residentId: c.residentId,
    roomId: c.roomId,
    unitId: c.unitId,
  };
}

/* ------------------------------ Filtering -------------------------------- */

/** Return the list of complaint rows that match the current search + filters. */
function getFilteredRows() {
  const term = searchInput.value.trim().toLowerCase();
  const status = filterStatus.value;
  const category = filterCategory.value;
  const block = filterBlock.value;
  const floor = filterFloor.value;
  const date = filterDate.value; // "YYYY-MM-DD"

  let rows = complaints.map(resolveComplaintRow);

  if (term) {
    rows = rows.filter((r) => {
      const haystack = [
        r.name,
        r.studentNumber,
        String(r.block),
        String(r.roomNumber),
        String(r.roomLetter),
        r.id,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }

  if (status) rows = rows.filter((r) => r.status === status);
  if (category) rows = rows.filter((r) => r.category === category);
  if (block) rows = rows.filter((r) => r.block === block);

  if (floor) {
    rows = rows.filter((r) => {
      const room = getRoomOf({ roomId: r.roomId });
      return String(room?.floor) === floor;
    });
  }

  if (date) {
    rows = rows.filter((r) => {
      if (!r.createdAt) return false;
      const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      return iso === date;
    });
  }

  // Sorting.
  switch (sortBy.value) {
    case "oldest":
      rows.sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
      break;
    case "status":
      rows.sort((a, b) => a.status.localeCompare(b.status));
      break;
    case "block":
      rows.sort((a, b) =>
        String(a.block).localeCompare(String(b.block), undefined, { numeric: true })
      );
      break;
    default: // newest
      rows.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
  }

  return rows;
}

function ts(dateLike) {
  if (!dateLike) return 0;
  if (typeof dateLike.toDate === "function") return dateLike.toDate().getTime();
  if (dateLike.seconds) return dateLike.seconds * 1000;
  return new Date(dateLike).getTime();
}

/* ------------------------------ Statistics ------------------------------- */

function renderStats() {
  const residents = Object.values(usersMap).filter((u) => u.role === "resident");
  const units = Object.values(unitsByRoom).flatMap(getRoomBedSlots);
  const occupied = units.filter((u) => u.occupied === true).length;
  const available = units.length - occupied;

  const counts = { Submitted: 0, "In Progress": 0, "Waiting for Parts": 0, Completed: 0 };
  complaints.forEach((c) => {
    const s = normalizeStatus(c.status);
    if (s in counts) counts[s] += 1;
  });

  $("#stat-residents").textContent = residents.length;
  $("#stat-rooms").textContent = Object.keys(roomsMap).length;
  $("#stat-occupied").textContent = occupied;
  $("#stat-available").textContent = available;
  $("#stat-complaints").textContent = complaints.length;
  $("#stat-submitted").textContent = counts.Submitted;
  $("#stat-inprogress").textContent = counts["In Progress"];
  $("#stat-waiting").textContent = counts["Waiting for Parts"];
  $("#stat-completed").textContent = counts.Completed;
}

/* ------------------------------ Complaints ------------------------------- */

function renderComplaints(rows) {
  complaintsBody.innerHTML = "";

  if (rows.length === 0) {
    complaintsEmpty.classList.remove("hidden");
    return;
  }
  complaintsEmpty.classList.add("hidden");

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    const td = (text, cls) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      if (cls) cell.className = cls;
      return cell;
    };

    const issueTd = td(r.issues);
    issueTd.title = r.issues;

    const statusTd = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = statusBadge(r.status);
    badge.textContent = r.status;
    statusTd.appendChild(badge);

    // Actions: View button.
    const actionsTd = document.createElement("td");
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn--ghost btn--sm";
    viewBtn.textContent = "View";
    viewBtn.setAttribute("aria-label", `View complaint ${r.shortId}`);
    viewBtn.addEventListener("click", () => openDetailModal(r.id));
    actionsTd.appendChild(viewBtn);

    tr.appendChild(td(r.shortId));
    tr.appendChild(td(r.name));
    tr.appendChild(td(r.studentNumber));
    tr.appendChild(td(r.block));
    tr.appendChild(td(r.roomNumber));
    tr.appendChild(td(r.roomLetter));
    tr.appendChild(issueTd);
    tr.appendChild(statusTd);
    tr.appendChild(td(formatDate(r.createdAt)));
    tr.appendChild(actionsTd);

    complaintsBody.appendChild(tr);
  });
}

function refreshComplaintsView() {
  renderComplaints(getFilteredRows());
}

/* ------------------------------ Residents -------------------------------- */

function renderResidents() {
  const term = residentSearch.value.trim().toLowerCase();
  const residents = Object.values(usersMap).filter((u) => u.role === "resident");
  residentsGrid.innerHTML = "";

  if (residents.length === 0) {
    residentsEmpty.classList.remove("hidden");
    return;
  }
  residentsEmpty.classList.add("hidden");

  // Cache complaint counts per resident.
  const complaintCounts = {};
  complaints.forEach((c) => {
    complaintCounts[c.residentId] = (complaintCounts[c.residentId] || 0) + 1;
  });

  const filtered = term
    ? residents.filter((r) => {
        const unit = r.unitId ? unitsMap[r.unitId] : null;
        const room = r.roomId ? roomsMap[r.roomId] : null;
        const haystack = [
          r.name,
          r.studentNumber,
          r.email,
          unit?.block || room?.block,
          unit?.roomNumber ?? room?.roomNumber,
          unit?.roomLetter || unit?.unitName,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
    : residents;

  filtered.forEach((resident) => {
    const unit = resident.unitId ? unitsMap[resident.unitId] : null;
    const room = resident.roomId ? roomsMap[resident.roomId] : null;
    const block = unit?.block || room?.block || "—";
    const roomNumber = unit?.roomNumber ?? room?.roomNumber ?? "—";
    const roomLetter = unit?.roomLetter || unit?.unitName || "—";

    const card = document.createElement("article");
    card.className = "resident-card";

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "resident-card__name";
    name.textContent = resident.name || "Unnamed";
    const meta = document.createElement("div");
    meta.className = "resident-card__meta";
    meta.textContent =
      `${resident.studentNumber || "—"} · Block ${block} · Room ${roomNumber}${roomLetter}`;
    info.appendChild(name);
    info.appendChild(meta);

    const email = document.createElement("div");
    email.className = "resident-card__meta";
    email.textContent = resident.email || "";

    const complaintsBadge = document.createElement("div");
    complaintsBadge.className = "resident-card__complaints badge badge--pending";
    complaintsBadge.textContent = `${complaintCounts[resident.uid] || 0} complaint(s)`;

    card.appendChild(info);
    card.appendChild(email);
    card.appendChild(complaintsBadge);
    residentsGrid.appendChild(card);
  });
}

/* ------------------------------ Unit Profiles ---------------------------- */

/**
 * Build a map of roomId -> room profile. Each room profile groups all of
 * its sub-units (room letters a/b/c) into a single card so management sees
 * one compact entry per room (e.g. "A 101") instead of one card per letter.
 *   {
 *     room:       the parent room doc,
 *     units:      [unit docs] belonging to this room,
 *     residents:  [user docs] assigned to any unit in this room,
 *     complaints: [complaint docs] filed for this room,
 *   }
 */
function buildRoomProfiles() {
  const profiles = new Map();

  Object.keys(roomsMap).forEach((roomId) => {
    profiles.set(roomId, {
      roomId,
      room: roomsMap[roomId],
      units: getRoomBedSlots(unitsByRoom[roomId] || []),
      residents: [],
      complaints: [],
    });
  });

  // Assign residents to the room of their unit (by denormalized unitId or
  // by the unit that lists this resident as residentId).
  Object.values(usersMap)
    .filter((u) => u.role === "resident")
    .forEach((resident) => {
      let unit = resident.unitId ? unitsMap[resident.unitId] : null;
      if (!unit) {
        unit = Object.values(unitsMap).find((u) => u.residentId === resident.uid) || null;
      }
      const roomKey = unit?.roomId || resident.roomId || null;
      if (roomKey && profiles.has(roomKey)) {
        profiles.get(roomKey).residents.push(resident);
      }
    });

  // Assign complaints to the room of their unit (prefer complaint.unitId,
  // then the resident's unit, then the room's first unit, then complaint.roomId).
  complaints.forEach((c) => {
    let unit = c.unitId ? unitsMap[c.unitId] : null;
    if (!unit) {
      const resident = getResident(c.residentId);
      unit = (resident?.unitId && unitsMap[resident.unitId]) || null;
      if (!unit) unit = getUnitOf(c);
    }
    const roomKey = unit?.roomId || c.roomId || null;
    if (roomKey && profiles.has(roomKey)) {
      profiles.get(roomKey).complaints.push(c);
    }
  });

  // Drop rooms that have no units mapped.
  Array.from(profiles.keys()).forEach((k) => {
    if (profiles.get(k).units.length === 0) profiles.delete(k);
  });

  return profiles;
}

/** Resolve a room profile into display fields for cards. */
function resolveRoomProfile(profile) {
  const room = profile.room;
  const units = profile.units;
  const block = room?.block || units[0]?.block || "—";
  const roomNumber = room?.roomNumber ?? units[0]?.roomNumber ?? "—";
  const occupiedCount = units.filter((u) => u.occupied === true).length;
  const subRooms = getSubRooms(units);
const active = profile.complaints.filter(
    (c) =>
      normalizeStatus(c.status) !== "Completed" &&
      normalizeStatus(c.status) !== "Cancelled"
  ).length;

  return {
    roomId: profile.roomId,
    label: `Block ${block} · Unit ${roomNumber}`,
    block,
    roomNumber,
    units,
    subRooms,
    occupiedCount,
    availableCount: units.length - occupiedCount,
    residents: profile.residents,
    complaintCount: profile.complaints.length,
    activeCount: active,
    complaints: profile.complaints,
  };
}

/** Render the block picker grid (one card per block that has units). */
function renderBlockPicker() {
  const profiles = buildRoomProfiles();
  const blocks = new Set();
  Array.from(profiles.values()).forEach((p) => {
    const room = p.room;
    const block = room?.block || p.units[0]?.block || null;
    if (block) blocks.add(block);
  });

  const sortedBlocks = Array.from(blocks).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  unitsBlockGrid.innerHTML = "";
  if (sortedBlocks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "table-empty";
    empty.textContent = "No unit profiles available.";
    unitsBlockGrid.appendChild(empty);
    return;
  }

  sortedBlocks.forEach((block) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "block-card";
    btn.dataset.block = block;
    btn.setAttribute("aria-label", `View unit profiles for Block ${block}`);

    const name = document.createElement("span");
    name.className = "block-card__name";
    name.textContent = `Block ${block}`;

    const blockProfiles = Array.from(profiles.values()).filter(
      (p) => (p.room?.block || p.units[0]?.block) === block
    );
    const units = blockProfiles.flatMap((profile) => profile.units);
    const occupied = units.filter((unit) => unit.occupied === true).length;

    const meta = document.createElement("span");
    meta.className = "block-card__meta";
    meta.textContent =
      `${blockProfiles.length} room${blockProfiles.length === 1 ? "" : "s"} · `
      + `${occupied}/${units.length} beds occupied`;

    const cta = document.createElement("span");
    cta.className = "block-card__cta";
    cta.textContent = "View";

    btn.appendChild(name);
    btn.appendChild(meta);
    btn.appendChild(cta);
    btn.addEventListener("click", () => openBlock(block));
    unitsBlockGrid.appendChild(btn);
  });
}

/** Show the unit grid for a selected block. */
function openBlock(block) {
  selectedBlock = block;
  unitSearch.value = "";
  unitStatus.value = "";
  unitsBlockPicker.classList.add("hidden");
  unitsBlockView.classList.remove("hidden");
  unitsToolbar.classList.remove("hidden");
  unitsBlockTitle.textContent = `Block ${block} · Unit Profiles`;
  renderUnits();
}

/** Return to the block picker. */
function showBlockPicker() {
  selectedBlock = "";
  unitSearch.value = "";
  unitStatus.value = "";
  unitsBlockView.classList.add("hidden");
  unitsToolbar.classList.add("hidden");
  unitsBlockPicker.classList.remove("hidden");
  unitsEmpty.classList.add("hidden");
  renderBlockPicker();
}

/** Render the Room/Unit grid honouring search + filters (within selected block). */
function renderUnits() {
  const term = unitSearch.value.trim().toLowerCase();
  const block = selectedBlock;
  const status = unitStatus.value;

  const profiles = buildRoomProfiles();
  let cards = Array.from(profiles.values()).map(resolveRoomProfile);

  if (term) {
    cards = cards.filter((c) => {
      const residentNames = c.residents.map((r) => r.name || "").join(" ");
      const residentNumbers = c.residents.map((r) => r.studentNumber || "").join(" ");
      const unitLetters = c.units
        .map((u) => `${u.roomLetter || u.unitName || ""}`)
        .join(" ");
      const haystack = [
        c.label,
        c.roomId,
        c.block,
        String(c.roomNumber),
        unitLetters,
        residentNames,
        residentNumbers,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }

  if (block) cards = cards.filter((c) => c.block === block);
  if (status === "occupied") cards = cards.filter((c) => c.occupiedCount > 0);
  // A room is available whenever it has at least one free bed. This includes
  // partially occupied rooms such as F506-C with one resident remaining.
  if (status === "available") cards = cards.filter((c) => c.availableCount > 0);
  if (status === "has-complaints") cards = cards.filter((c) => c.complaintCount > 0);

  // Sort: rooms with any occupied units first, then by block/room number.
  cards.sort((a, b) => {
    const aOccupied = a.occupiedCount > 0;
    const bOccupied = b.occupiedCount > 0;
    if (aOccupied !== bOccupied) return aOccupied ? -1 : 1;
    return String(a.label).localeCompare(String(b.label), undefined, { numeric: true });
  });

  unitsGrid.innerHTML = "";
  if (cards.length === 0) {
    unitsEmpty.classList.remove("hidden");
    return;
  }
  unitsEmpty.classList.add("hidden");

  cards.forEach((card) => {
    const el = document.createElement("article");
    el.className = "unit-card";

    const header = document.createElement("div");
    header.className = "unit-card__header";

    const title = document.createElement("div");
    title.className = "unit-card__title";
    title.textContent = card.label;

    const statusChip = document.createElement("span");
    const anyOccupied = card.occupiedCount > 0;
    statusChip.className = "occupancy-chip " + (anyOccupied ? "is-occupied" : "is-available");
    statusChip.textContent = anyOccupied
      ? `${card.occupiedCount}/${card.units.length} Occupied`
      : "Available";
    header.appendChild(title);
    header.appendChild(statusChip);

    // A/B/C sub-room occupancy chips (each has two resident beds).
    const lettersBox = document.createElement("div");
    lettersBox.className = "unit-card__letters";
    card.subRooms.forEach(({ letter, slots }) => {
      const chip = document.createElement("span");
      const occupiedCount = slots.filter((slot) => slot.occupied === true).length;
      const occupied = occupiedCount > 0;
      chip.className = "occupancy-chip " + (occupied ? "is-occupied" : "is-available");
      chip.textContent = `Room ${letter} — ${occupiedCount}/${slots.length}`;
      chip.setAttribute("aria-label", `${card.label} Room ${letter}: ${occupiedCount} of ${slots.length} beds occupied`);
      lettersBox.appendChild(chip);
    });

    const complaintsRow = document.createElement("div");
    complaintsRow.className = "unit-card__complaints";
    const badge = document.createElement("span");
    badge.className = "badge badge--pending";
    badge.textContent = `${card.complaintCount} complaint(s)`;
    const activeBadge = document.createElement("span");
    activeBadge.className = "badge badge--in-progress";
    activeBadge.textContent = `${card.activeCount} active`;
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn--primary btn--sm";
    viewBtn.textContent = "View Profile";
    viewBtn.setAttribute("aria-label", `View room profile ${card.label}`);
    viewBtn.addEventListener("click", () => openUnitModal(card.roomId));
    complaintsRow.appendChild(badge);
    complaintsRow.appendChild(activeBadge);
    complaintsRow.appendChild(viewBtn);

    el.appendChild(header);
    el.appendChild(lettersBox);
    el.appendChild(complaintsRow);
    unitsGrid.appendChild(el);
  });
}

function refreshUnitsView() {
  renderUnits();
}

/* ------------------------------ Unit modal ------------------------------ */

function closeUnitModal() {
  unitModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

/** Open the room profile modal for a room id. */
function openUnitModal(roomId) {
  activeUnitRoomId = roomId;
  const profile = buildRoomProfiles().get(roomId);
  if (!profile) return;

  const resolved = resolveRoomProfile(profile);

  unitModalTitle.textContent = `Unit Profile · Block ${resolved.block}, Unit ${resolved.roomNumber}`;

  // Summary grid.
  unitModalSummary.innerHTML = "";
  const summaryItems = [
    ["Room", resolved.label],
    ["Room Letters", `${resolved.subRooms.length} (${resolved.subRooms.map(({ letter }) => letter).join(", ")})`],
    ["Bed occupancy", `${resolved.occupiedCount}/${resolved.units.length} occupied`],
    ["Residents", `${resolved.residents.length}`],
    ["Complaints", `${resolved.complaintCount}`],
    ["Active Complaints", `${resolved.activeCount}`],
  ];
  summaryItems.forEach(([labelText, value]) => {
    const div = document.createElement("div");
    div.className = "detail-grid__item";
    const l = document.createElement("div");
    l.className = "detail-grid__label";
    l.textContent = labelText;
    const v = document.createElement("div");
    v.className = "detail-grid__value";
    v.textContent = value;
    div.appendChild(l);
    div.appendChild(v);
    unitModalSummary.appendChild(div);
  });

  // Residents.
  unitModalResidents.innerHTML = "";
  if (resolved.residents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notes-list__empty";
    empty.textContent = "No residents assigned to this room.";
    unitModalResidents.appendChild(empty);
  } else {
    resolved.residents.forEach((r) => {
      const row = document.createElement("div");
      row.className = "unit-resident";

      const info = document.createElement("div");
      const name = document.createElement("div");
      name.className = "unit-resident__name";
      name.textContent = r.name || "Unnamed";
      const unit = r.unitId ? unitsMap[r.unitId] : null;
      const meta = document.createElement("div");
      meta.className = "unit-resident__meta";
      meta.textContent = `${r.studentNumber || "—"} · Room ${unit?.roomLetter || unit?.unitName || "—"} · ${r.email || ""}`;
      info.appendChild(name);
      info.appendChild(meta);
      row.appendChild(info);

      const badge = document.createElement("span");
      badge.className = "badge badge--pending";
      const count = complaints.filter((c) => c.residentId === r.uid).length;
      badge.textContent = `${count} complaint(s)`;
      row.appendChild(badge);

      unitModalResidents.appendChild(row);
    });
  }

  // Complaints (grouped for this room, newest first).
  unitModalComplaints.innerHTML = "";
  const unitComplaints = resolved.complaints
    .slice()
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt));

  if (unitComplaints.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notes-list__empty";
    empty.textContent = "No complaints for this unit.";
    unitModalComplaints.appendChild(empty);
  } else {
    unitComplaints.forEach((c) => {
      const r = resolveComplaintRow(c);
      const item = document.createElement("div");
      item.className = "unit-complaint";

      const head = document.createElement("div");
      head.className = "unit-complaint__head";
      const title = document.createElement("span");
      title.className = "unit-complaint__title";
      title.textContent = `${r.category} · ${r.issues}`;
      const statusEl = document.createElement("span");
      const badge = document.createElement("span");
      badge.className = statusBadge(r.status);
      badge.textContent = r.status;
      statusEl.appendChild(badge);
      head.appendChild(title);
      head.appendChild(statusEl);

      const meta = document.createElement("div");
      meta.className = "unit-complaint__meta";
      meta.appendChild(document.createTextNode(`By ${r.name} (${r.studentNumber})`));
      const dateSpan = document.createElement("span");
      dateSpan.textContent = formatDate(r.createdAt);
      meta.appendChild(dateSpan);
      const idSpan = document.createElement("span");
      idSpan.textContent = r.shortId;
      meta.appendChild(idSpan);

      const actions = document.createElement("div");
      actions.className = "unit-complaint__actions";
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn btn--ghost btn--sm";
      viewBtn.textContent = "View Details";
      viewBtn.setAttribute("aria-label", `View complaint ${r.shortId}`);
      viewBtn.addEventListener("click", () => {
        closeUnitModal();
        openDetailModal(c.id);
      });
      actions.appendChild(viewBtn);

      item.appendChild(head);
      item.appendChild(meta);
      item.appendChild(actions);
      unitModalComplaints.appendChild(item);
    });
  }

  unitModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  loadUnitAnnouncements(roomId);
}

async function loadUnitAnnouncements(roomId) {
  unitModalAnnouncements.innerHTML = '<div class="notes-list__empty">Loading shared updates…</div>';
  try {
    const announcementsQuery = query(collection(db, "unitAnnouncements"), where("roomId", "==", roomId), orderBy("createdAt", "desc"));
    const [snap, messages] = await Promise.all([
      getDocs(announcementsQuery),
      fetchUnitMessages(roomId),
    ]);
    if (roomId !== activeUnitRoomId) return;
    unitModalAnnouncements.innerHTML = "";
    const updates = [
      ...snap.docs.map((announcementDoc) => ({
        id: announcementDoc.id,
        ...announcementDoc.data(),
      })),
      ...messages,
    ].sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
    if (updates.length === 0) {
      unitModalAnnouncements.innerHTML = '<div class="notes-list__empty">No shared updates for this unit yet.</div>';
      return;
    }
    updates.forEach((announcement) => {
      const item = document.createElement("div");
      item.className = "unit-announcement";
      const text = document.createElement("div");
      text.className = "note-item__text";
      text.textContent = announcement.message || "";
      const meta = document.createElement("div");
      meta.className = "note-item__meta";
      const audience = announcement.roomLetter
        ? `Room ${announcement.roomLetter}`
        : "Entire unit";
      meta.textContent = `${announcement.authorName || "Management"} · ${audience} · ${formatDate(announcement.createdAt)}`;
      item.append(text, meta);
      unitModalAnnouncements.appendChild(item);
    });
  } catch (error) {
    console.error("[management] load unit announcements error:", error);
    if (roomId === activeUnitRoomId) unitModalAnnouncements.innerHTML = '<div class="notes-list__empty">Could not load shared updates.</div>';
  }
}

async function handleUnitAnnouncement(event) {
  event.preventDefault();
  const message = unitAnnouncementInput.value.trim();
  if (!message || !activeUnitRoomId) return;
  unitAnnouncementSubmit.disabled = true;
  try {
    const profileEntry = buildRoomProfiles().get(activeUnitRoomId);
    if (!profileEntry) throw new Error("This unit profile is no longer available.");
    const resolved = resolveRoomProfile(profileEntry);
    const roomLetter = unitAnnouncementTarget.value || null;
    const recipients = resolved.residents.filter((resident) => {
      const residentUnit = resident.unitId ? unitsMap[resident.unitId] : null;
      const residentRoomId = residentUnit?.roomId || resident.roomId;
      const residentRoomLetter = residentUnit?.roomLetter || residentUnit?.unitName || resident.roomLetter;
      return residentRoomId === activeUnitRoomId
        && (!roomLetter || residentRoomLetter === roomLetter);
    });
    await sendUnitMessage({
      roomId: activeUnitRoomId,
      block: resolved.block,
      unitNumber: resolved.roomNumber,
      roomLetter,
      recipientUids: recipients.map((resident) => resident.uid),
      message,
      authorId: currentProfile?.uid,
      authorName: currentProfile?.name || "Management",
    });
    unitAnnouncementInput.value = "";
    unitAnnouncementTarget.value = "";
    toast(`Message sent to ${recipients.length} resident${recipients.length === 1 ? "" : "s"}.`, "success");
    await loadUnitAnnouncements(activeUnitRoomId);
  } catch (error) {
    console.error("[management] add unit announcement error:", error);
    toast("Could not send the shared update. Please check permissions.", "error");
  } finally {
    unitAnnouncementSubmit.disabled = false;
  }
}

/* ---------------------------- Details modal ------------------------------ */

function openDetailModal(complaintId) {
  activeComplaintId = complaintId;
  const c = complaints.find((x) => x.id === complaintId);
  if (!c) return;

  const r = resolveComplaintRow(c);

  // Details grid.
  modalDetails.innerHTML = "";
  const items = [
    ["Complaint ID", r.shortId],
    ["Resident", r.name],
    ["Student Number", r.studentNumber],
    ["Email", r.email],
    ["Block", r.block],
    ["Unit Number", r.roomNumber],
    ["Room Letter", r.roomLetter],
    ["Issues", r.issues],
    ["Current Status", r.status],
    ["Date Submitted", formatDate(r.createdAt)],
    ["Last Updated", formatDate(r.updatedAt)],
  ];
  items.forEach(([label, value]) => {
    const div = document.createElement("div");
    div.className = "detail-grid__item";
    const l = document.createElement("div");
    l.className = "detail-grid__label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "detail-grid__value";
    v.textContent = value || "—";
    div.appendChild(l);
    div.appendChild(v);
    modalDetails.appendChild(div);
  });

// Status badge + workflow select.
  modalStatusBadge.innerHTML = "";
  const badge = document.createElement("span");
  badge.className = statusBadge(r.status);
  badge.textContent = r.status;
  modalStatusBadge.appendChild(badge);

  modalStatusSelect.innerHTML = "";
  COMPLAINT_STATUSES.forEach((status) => {
    const opt = document.createElement("option");
    opt.value = status;
    opt.textContent = status;
    if (status === r.status) opt.selected = true;
    modalStatusSelect.appendChild(opt);
  });
  modalStatusSelect.disabled = false;

  // Priority select.
  modalPrioritySelect.value = r.priority;

  // Completion dates (management can edit).
  modalEstimated.value = toDateInputValue(r.estimatedCompletion);
  modalActual.value = toDateInputValue(r.actualCompletion);
  modalEstimated.disabled = false;
  modalActual.disabled = false;

  // Photos.
  renderModalPhotos(r.photoURLs);

  // Timeline.
  modalTimeline.innerHTML = '<div class="timeline__empty">Loading timeline…</div>';
  loadTimeline(complaintId)
    .then((events) => renderTimeline(modalTimeline, events))
    .catch((error) => {
      console.error("[management] loadTimeline error:", error);
      modalTimeline.innerHTML = '<div class="timeline__empty">Could not load timeline.</div>';
    });

  // Reopen review.
  renderReopenReview(c);

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  loadNotes(complaintId);
}

/** Convert a date-like value to a YYYY-MM-DD input value (or ""). */
function toDateInputValue(value) {
  if (!value) return "";
  let date;
  if (typeof value.toDate === "function") date = value.toDate();
  else if (value.seconds) date = new Date(value.seconds * 1000);
  else if (value instanceof Date) date = value;
  else date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** Render complaint photos in the modal gallery. */
function renderModalPhotos(urls) {
  modalPhotos.innerHTML = "";
  if (!Array.isArray(urls) || urls.length === 0) {
    const empty = document.createElement("div");
    empty.className = "photo-empty";
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

/** Render the reopen request review controls (management only). */
function renderReopenReview(complaint) {
  reopenReview.innerHTML = "";
  const requested = complaint.reopenRequested;

  if (!requested) {
    const empty = document.createElement("div");
    empty.className = "notes-list__empty";
    empty.textContent =
      complaint.reopenStatus === "Approved"
        ? "This complaint was reopened and is In Progress."
        : "No reopen request.";
    reopenReview.appendChild(empty);
    return;
  }

  const status = normalizeStatus(complaint.status);
  const resolved =
    complaint.reopenStatus === "Rejected" || complaint.reopenStatus === "Approved";

  const msg = document.createElement("p");
  msg.className = "text-muted";
  msg.textContent =
    complaint.reopenStatus === "Approved"
      ? "This reopen request was approved. The complaint is In Progress."
      : complaint.reopenStatus === "Rejected"
      ? "This reopen request was rejected. The complaint remains completed."
      : "The resident has requested to reopen this completed complaint.";

  const actions = document.createElement("div");
  actions.className = "reopen-review__actions";

  const approveBtn = document.createElement("button");
  approveBtn.type = "button";
  approveBtn.className = "btn btn--primary btn--sm";
  approveBtn.textContent = "Approve";
  approveBtn.disabled = resolved;
  approveBtn.addEventListener("click", () => handleReopenDecision(true));

  const rejectBtn = document.createElement("button");
  rejectBtn.type = "button";
  rejectBtn.className = "btn btn--ghost btn--sm";
  rejectBtn.textContent = "Reject";
  rejectBtn.disabled = resolved;
  rejectBtn.addEventListener("click", () => handleReopenDecision(false));

  actions.appendChild(approveBtn);
  actions.appendChild(rejectBtn);
  reopenReview.appendChild(msg);
  reopenReview.appendChild(actions);
}

/** Handle approve/reject of a reopen request. */
async function handleReopenDecision(approve) {
  if (!activeComplaintId) return;
  const c = complaints.find((x) => x.id === activeComplaintId);
  if (!c) return;

  try {
    if (approve) {
      await updateDoc(doc(db, "complaints", activeComplaintId), {
        status: "In Progress",
        reopenStatus: "Approved",
        updatedAt: serverTimestamp(),
      });
      c.status = "In Progress";
      c.reopenStatus = "Approved";
      await addTimelineEvent(activeComplaintId, {
        action: "Reopen Approved",
        description: "Management approved the reopen request. Complaint moved to In Progress.",
        authorId: currentProfile?.uid || null,
        authorName: currentProfile?.name || "Management",
        authorRole: "management",
      });
      toast("Reopen approved. Complaint moved to In Progress.", "success");
    } else {
      await updateDoc(doc(db, "complaints", activeComplaintId), {
        reopenStatus: "Rejected",
        updatedAt: serverTimestamp(),
      });
      c.reopenStatus = "Rejected";
      await addTimelineEvent(activeComplaintId, {
        action: "Reopen Rejected",
        description: "Management rejected the reopen request. Complaint remains completed.",
        authorId: currentProfile?.uid || null,
        authorName: currentProfile?.name || "Management",
        authorRole: "management",
      });
      toast("Reopen request rejected.", "info");
    }
    renderStats();
    refreshComplaintsView();
    openDetailModal(activeComplaintId);
  } catch (error) {
    console.error("[management] reopen decision error:", error);
    toast("Could not process the reopen request. Please try again.", "error");
  }
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  activeComplaintId = null;
}

async function handleStatusChange() {
  if (!activeComplaintId) return;
  const newStatus = modalStatusSelect.value;
  const c = complaints.find((x) => x.id === activeComplaintId);
  if (!c || normalizeStatus(c.status) === newStatus) return;

  modalStatusSelect.disabled = true;
  try {
    await updateDoc(doc(db, "complaints", activeComplaintId), {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
    // Update local cache.
    c.status = newStatus;
    await addTimelineEvent(activeComplaintId, {
      action: `Status → ${newStatus}`,
      description: `Management updated the complaint status to "${newStatus}".`,
      authorId: currentProfile?.uid || null,
      authorName: currentProfile?.name || "Management",
      authorRole: "management",
    });
    toast(`Complaint marked as "${newStatus}".`, "success");
    renderStats();
    refreshComplaintsView();
    openDetailModal(activeComplaintId);
  } catch (error) {
    console.error("[management] status update error:", error);
    toast("Could not update status. Please try again.", "error");
    modalStatusSelect.disabled = false;
  }
}

/* --------------------- Priority & completion dates ----------------------- */

async function handlePriorityChange() {
  if (!activeComplaintId) return;
  const newPriority = modalPrioritySelect.value;
  const c = complaints.find((x) => x.id === activeComplaintId);
  if (!c || normalizePriority(c.priority) === newPriority) return;

  modalPrioritySelect.disabled = true;
  try {
    await updateDoc(doc(db, "complaints", activeComplaintId), {
      priority: newPriority,
      updatedAt: serverTimestamp(),
    });
    c.priority = newPriority;
    await addTimelineEvent(activeComplaintId, {
      action: `Priority set to ${newPriority}`,
      description: `Management assigned a "${newPriority}" priority.`,
      authorId: currentProfile?.uid || null,
      authorName: currentProfile?.name || "Management",
      authorRole: "management",
    });
    toast(`Priority set to "${newPriority}".`, "success");
    refreshComplaintsView();
    openDetailModal(activeComplaintId);
  } catch (error) {
    console.error("[management] priority update error:", error);
    toast("Could not update priority. Please try again.", "error");
    modalPrioritySelect.disabled = false;
  }
}

async function handleDatesChange() {
  if (!activeComplaintId) return;
  const c = complaints.find((x) => x.id === activeComplaintId);
  if (!c) return;

  const estimate = modalEstimated.value; // YYYY-MM-DD or ""
  const actual = modalActual.value;

  // Only write if something changed.
  if (
    estimate === toDateInputValue(c.estimatedCompletion) &&
    actual === toDateInputValue(c.actualCompletion)
  ) {
    return;
  }

  modalEstimated.disabled = true;
  modalActual.disabled = true;
  try {
    await updateDoc(doc(db, "complaints", activeComplaintId), {
      estimatedCompletion: estimate ? new Date(`${estimate}T00:00:00`) : null,
      actualCompletion: actual ? new Date(`${actual}T00:00:00`) : null,
      updatedAt: serverTimestamp(),
    });
    c.estimatedCompletion = estimate ? new Date(`${estimate}T00:00:00`) : null;
    c.actualCompletion = actual ? new Date(`${actual}T00:00:00`) : null;

    if (estimate) {
      await addTimelineEvent(activeComplaintId, {
        action: "Estimated completion set",
        description: `Management estimated completion by ${estimate}.`,
        authorId: currentProfile?.uid || null,
        authorName: currentProfile?.name || "Management",
        authorRole: "management",
      });
    }
    if (actual) {
      await addTimelineEvent(activeComplaintId, {
        action: "Actual completion recorded",
        description: `Management recorded actual completion on ${actual}.`,
        authorId: currentProfile?.uid || null,
        authorName: currentProfile?.name || "Management",
        authorRole: "management",
      });
    }

    toast("Completion dates updated.", "success");
    refreshComplaintsView();
    openDetailModal(activeComplaintId);
  } catch (error) {
    console.error("[management] dates update error:", error);
    toast("Could not update completion dates. Please try again.", "error");
    modalEstimated.disabled = false;
    modalActual.disabled = false;
  }
}

/* ------------------------------ Notes ------------------------------------ */

async function loadNotes(complaintId) {
  notesList.innerHTML = '<div class="notes-list__empty">No maintenance notes yet.</div>';
  try {
    const q = query(
      collection(db, "complaints", complaintId, "maintenanceNotes"),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    notesList.innerHTML = "";
    snap.docs.forEach((d) => {
      const note = d.data();
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
      notesList.appendChild(item);
    });
  } catch (error) {
    console.error("[management] loadNotes error:", error);
    notesList.innerHTML = '<div class="notes-list__empty">Could not load notes.</div>';
  }
}

async function handleAddNote(event) {
  event.preventDefault();
  const text = noteInput.value.trim();
  if (!text || !activeComplaintId) return;

  noteSubmit.disabled = true;
  try {
    await addDoc(
      collection(db, "complaints", activeComplaintId, "maintenanceNotes"),
      {
        text,
        authorId: currentProfile?.uid || null,
        authorName: currentProfile?.name || "Management",
        createdAt: serverTimestamp(),
      }
    );
    noteInput.value = "";
    toast("Maintenance note added.", "success");
    await loadNotes(activeComplaintId);
  } catch (error) {
    console.error("[management] add note error:", error);
    toast("Could not add the note. Please check permissions.", "error");
  } finally {
    noteSubmit.disabled = false;
  }
}

/* -------------------------------- Tabs ----------------------------------- */

function switchTab(tab) {
  const isOverview = tab === "overview";
  const isComplaints = tab === "complaints";
  const isResidents = tab === "residents";
  const isUnits = tab === "units";

  tabOverviewBtn.classList.toggle("is-active", isOverview);
  tabComplaintsBtn.classList.toggle("is-active", isComplaints);
  tabResidentsBtn.classList.toggle("is-active", isResidents);
  tabUnitsBtn.classList.toggle("is-active", isUnits);

  tabOverviewBtn.setAttribute("aria-selected", String(isOverview));
  tabComplaintsBtn.setAttribute("aria-selected", String(isComplaints));
  tabResidentsBtn.setAttribute("aria-selected", String(isResidents));
  tabUnitsBtn.setAttribute("aria-selected", String(isUnits));

  viewOverview.classList.toggle("hidden", !isOverview);
  viewComplaints.classList.toggle("hidden", !isComplaints);
  viewResidents.classList.toggle("hidden", !isResidents);
  viewUnits.classList.toggle("hidden", !isUnits);
}

/* ----------------------------- Event wiring ------------------------------ */

tabOverviewBtn.addEventListener("click", () => switchTab("overview"));
tabComplaintsBtn.addEventListener("click", () => switchTab("complaints"));
tabResidentsBtn.addEventListener("click", () => switchTab("residents"));
tabUnitsBtn.addEventListener("click", () => {
  switchTab("units");
  if (!selectedBlock) showBlockPicker();
});

document.querySelectorAll("[data-dashboard-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const targetView = button.dataset.dashboardView;
    switchTab(targetView);

    if (targetView === "units") {
      if (!selectedBlock) showBlockPicker();
      return;
    }

    if (targetView === "complaints") {
      searchInput.value = "";
      filterStatus.value = button.dataset.complaintStatus || "";
      filterCategory.value = "";
      filterBlock.value = "";
      filterFloor.value = "";
      filterDate.value = "";
      sortBy.value = "newest";
      refreshComplaintsView();
    }
  });
});

searchInput.addEventListener("input", refreshComplaintsView);
filterStatus.addEventListener("change", refreshComplaintsView);
filterCategory.addEventListener("change", refreshComplaintsView);
filterBlock.addEventListener("change", refreshComplaintsView);
filterFloor.addEventListener("change", refreshComplaintsView);
filterDate.addEventListener("change", refreshComplaintsView);
sortBy.addEventListener("change", refreshComplaintsView);

residentSearch.addEventListener("input", renderResidents);

unitSearch.addEventListener("input", refreshUnitsView);
unitStatus.addEventListener("change", refreshUnitsView);
unitsBack.addEventListener("click", showBlockPicker);

document.querySelectorAll("[data-close-unit-modal]").forEach((el) => {
  el.addEventListener("click", closeUnitModal);
});
unitAnnouncementForm.addEventListener("submit", handleUnitAnnouncement);

modalStatusSelect.addEventListener("change", handleStatusChange);
modalPrioritySelect.addEventListener("change", handlePriorityChange);
modalEstimated.addEventListener("change", handleDatesChange);
modalActual.addEventListener("change", handleDatesChange);
noteForm.addEventListener("submit", handleAddNote);

document.querySelectorAll("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeModal);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
});

/* --------------------------------- Init ---------------------------------- */

async function init() {
  const profile = await requireRole(["management"]);
  if (!profile) return;
  currentProfile = profile;

  renderNav(profile);

// Populate the status filter once.
  filterStatus.innerHTML = '<option value="">All statuses</option>';
  COMPLAINT_STATUSES.forEach((status) => {
    const opt = document.createElement("option");
    opt.value = status;
    opt.textContent = status;
    filterStatus.appendChild(opt);
  });

// The category filter and priority select options are already present in
  // the HTML markup (management.html). Populating them again here would
  // create duplicate <option> elements, so we leave them untouched.

  switchTab("overview");

  try {
    await loadAllData();
    const releasedCount = await releaseOrphanedUnits();
    if (releasedCount > 0) {
      toast(
        `${releasedCount} bed${releasedCount === 1 ? "" : "s"} released because the resident profile was deleted.`,
        "success"
      );
    }
    renderStats();
    refreshComplaintsView();
    renderResidents();
    showBlockPicker();
  } catch (error) {
    console.error("[management] init error:", error);
    complaintsLoading.classList.add("hidden");
    complaintsEmpty.textContent = "Could not load dashboard data. Please try again.";
    complaintsEmpty.classList.remove("hidden");
  }
}

init();
