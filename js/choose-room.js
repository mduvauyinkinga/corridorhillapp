/**
 * choose-room.js
 * ------------------------------------------------------------------
 * Guided room selection flow:
 *   Choose Block → Choose Unit Number → Choose Room Letter → Confirm.
 *
 * Data model (unchanged):
 *   rooms/{roomId}  → { block, roomNumber, ... }
 *   units/{unitId}  → { roomId, roomLetter, bedNumber, occupied, residentId }
 *   users/{uid}     → { ..., roomId, roomLetter, block, roomNumber }
 *
 * On confirmation (Firestore transaction):
 *   1. Re-read the selected unit inside the transaction.
 *   2. Verify it is still available (occupied === false).
 *   3. Verify the resident does not already have a room assigned.
 *   4. Update the unit:  occupied = true, residentId = uid.
 *   5. Update the resident profile: roomId, roomLetter, block, roomNumber.
 *   6. Commit.
 *
 * Rooms and units are loaded incrementally (per block / per room) so we
 * never fetch the whole collection at once.
 */

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  setButtonLoading,
  getFirebaseErrorMessage,
  showError,
  clearError,
  toast,
  $,
} from "./utils.js";

const BLOCKS = ["A", "B", "C", "D", "E", "F"];

let currentUid = null;
let selectedBlock = null;
let selectedRoom = null;   // { id, block, roomNumber }
let selectedUnit = null;   // An available bed slot in the selected room letter.

const blockSelect = $("#block-select");
const roomSelect = $("#room-select");
const unitList = $("#unit-list");
const blockStatus = $("#block-status");
const roomStatus = $("#room-status");
const unitStatus = $("#unit-status");
const summary = $("#selection-summary");
const selectionText = $("#selection-text");
const confirmBtn = $("#confirm-btn");

/* ------------------------- Progress indicator ------------------------- */

const progressSteps = Array.from(document.querySelectorAll(".room-progress__step"));

function setProgress(step) {
  progressSteps.forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle("is-active", n === step);
    el.classList.toggle("is-done", n < step);
  });
}

/* ------------------------- Guard: auth required ------------------------ */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUid = user.uid;

  // Prevent a resident who already has a room from claiming another.
  try {
    const userSnap = await getDoc(doc(db, "users", currentUid));
    const profile = userSnap.exists() ? userSnap.data() : null;
    if (profile?.roomId) {
      // Already assigned — straight to the dashboard.
      window.location.href = "dashboard.html";
      return;
    }
  } catch (error) {
    console.error("[choose-room] profile check error:", error);
    showError("Could not verify your account. Please try again.");
    return;
  }

  loadBlocks();
});

/* ------------------------------- Step 1: Block ------------------------ */

async function loadBlocks() {
  blockStatus.textContent = "Loading blocks…";
  blockSelect.disabled = true;

  // Blocks are static (A–F). No Firestore read needed for the list.
  BLOCKS.forEach((block) => {
    const option = document.createElement("option");
    option.value = block;
    option.textContent = `Block ${block}`;
    blockSelect.appendChild(option);
  });

  blockSelect.disabled = false;
  blockStatus.textContent = "Select the block for your room.";
  setProgress(1);
}

blockSelect.addEventListener("change", () => {
  const block = blockSelect.value;
  if (!block) return;

  selectedBlock = block;
  selectedRoom = null;
  selectedUnit = null;
  clearError();
  updateSelection();
  setProgress(2);

  // Reset the lower steps.
  roomListReset("Loading rooms…");
  unitListReset("Select a room first.");
  loadRooms(block);
});

/* --------------------------- Step 2: Unit number ---------------------- */

function roomListReset(statusText) {
  roomSelect.innerHTML = '<option value="">Select a room…</option>';
  roomSelect.disabled = true;
  roomStatus.textContent = statusText;
}

async function loadRooms(block) {
  try {
    const q = query(collection(db, "rooms"), where("block", "==", block));
    const roomsSnap = await getDocs(q);

    roomSelect.innerHTML = '<option value="">Select a room…</option>';
    if (roomsSnap.empty) {
      roomSelect.disabled = true;
      roomStatus.textContent = "No rooms in this block.";
      return;
    }

    const rooms = roomsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true }));

    rooms.forEach((room) => {
      const option = document.createElement("option");
      option.value = room.id;
      option.dataset.roomNumber = room.roomNumber;
      option.textContent = `Room ${room.roomNumber}`;
      roomSelect.appendChild(option);
    });

    roomSelect.disabled = false;
    roomStatus.textContent = "Select your unit number.";
  } catch (error) {
    console.error("[choose-room] loadRooms error:", error);
    roomSelect.disabled = true;
    roomStatus.textContent = "Could not load rooms.";
    showError(getFirebaseErrorMessage(error));
  }
}

roomSelect.addEventListener("change", () => {
  const roomId = roomSelect.value;
  if (!roomId) return;

  selectedRoom = {
    id: roomId,
    block: selectedBlock,
    roomNumber: roomSelect.selectedOptions[0]?.dataset.roomNumber,
  };
  selectedUnit = null;
  clearError();
  updateSelection();
  setProgress(3);

  unitListReset("Loading rooms…");
  loadUnits(roomId);
});

/* --------------------------- Step 3: Room letter ---------------------- */

function unitListReset(statusText) {
  unitList.innerHTML = "";
  unitStatus.textContent = statusText;
}

async function loadUnits(roomId) {
  unitStatus.textContent = "Loading rooms…";
  unitList.innerHTML = "";

  try {
    const q = query(collection(db, "units"), where("roomId", "==", roomId));
    const unitsSnap = await getDocs(q);

    unitStatus.textContent = "Select an available room.";
    if (unitsSnap.empty) {
      unitStatus.textContent = "No units in this room.";
      return;
    }

    // Each A/B/C room has two separately claimable bed slots. Group the
    // slots so residents choose a room letter, not an implementation detail.
    const slotsByLetter = new Map();
    unitsSnap.docs
      .map((snap) => ({ id: snap.id, ...snap.data() }))
      .filter((unit) => Number.isInteger(unit.bedNumber))
      .forEach((unit) => {
        const letter = unit.roomLetter || unit.unitName;
        if (!slotsByLetter.has(letter)) slotsByLetter.set(letter, []);
        slotsByLetter.get(letter).push(unit);
      });

    ["A", "B", "C"].forEach((letter) => {
      const slots = (slotsByLetter.get(letter) || [])
        .sort((a, b) => a.bedNumber - b.bedNumber);
      const availableSlots = slots.filter((slot) => slot.occupied === false);
      const available = availableSlots.length > 0;

      const label = document.createElement("label");
      label.className = "room-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "room-letter";
      input.value = letter;
      input.disabled = !available;

      const span = document.createElement("span");
      span.textContent = `Room ${letter}`;

      const status = document.createElement("span");
      status.className = available
        ? "room-option__status room-option__status--available"
        : "room-option__status room-option__status--occupied";
      status.textContent = slots.length === 2
        ? `${availableSlots.length}/2 available`
        : "Unavailable";

      label.appendChild(input);
      label.appendChild(span);
      label.appendChild(status);
      label.classList.toggle("is-occupied", !available);

      input.addEventListener("change", () => {
        // The transaction below re-checks this exact slot before claiming it.
        selectedUnit = availableSlots[0] || null;
        clearError();
        updateSelection();
      });

      unitList.appendChild(label);
    });
  } catch (error) {
    console.error("[choose-room] loadUnits error:", error);
    unitStatus.textContent = "Could not load rooms.";
    showError(getFirebaseErrorMessage(error));
  }
}

/* ---------------------------- Selection summary ----------------------- */

function updateSelection() {
  if (selectedRoom && selectedUnit) {
    selectionText.textContent =
      `Block ${selectedBlock} · Unit ${selectedRoom.roomNumber} · Room ${selectedUnit.roomLetter || selectedUnit.unitName || "?"}`;
    summary.hidden = false;
    confirmBtn.disabled = false;
    setProgress(4);
  } else {
    summary.hidden = true;
    confirmBtn.disabled = true;
  }
}

/* ------------------------------- Confirm ------------------------------ */

confirmBtn.addEventListener("click", async () => {
  if (!selectedRoom || !selectedUnit || !currentUid) return;

  const restore = setButtonLoading(confirmBtn, "Confirming…");

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Re-read the selected unit inside the transaction.
      const unitRef = doc(db, "units", selectedUnit.id);
      const unitSnap = await transaction.get(unitRef);
      if (!unitSnap.exists()) {
        throw new Error("This unit no longer exists. Please choose another.");
      }
      const unitData = unitSnap.data();

      // 2. Verify it is still available.
      if (unitData.occupied !== false) {
        throw new Error("Sorry, this room was just taken. Please choose another.");
      }

      // 3. Verify the resident does not already have a room assigned.
      const userRef = doc(db, "users", currentUid);
      const userSnap = await transaction.get(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;
      if (userData?.roomId) {
        throw new Error("You already have a room assigned.");
      }

      // 4. Update the unit as occupied.
      transaction.update(unitRef, {
        occupied: true,
        residentId: currentUid,
});

      // 5. Update the resident profile so the dashboard needs no extra reads.
      //    unitId is kept for backward compatibility with the complaint and
      //    management modules that still reference it.
      transaction.update(userRef, {
        roomId: selectedRoom.id,
        unitId: selectedUnit.id,
        roomLetter: selectedUnit.roomLetter || selectedUnit.unitName || null,
        block: selectedBlock,
        roomNumber: Number(selectedRoom.roomNumber),
      });
    });

    // 6. Commit succeeded — success message + redirect.
    toast("Room assigned successfully!", "success");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 800);
  } catch (error) {
    console.error("[choose-room] confirm error:", error);
    showError(getFirebaseErrorMessage(error));
    restore();
  }
});
