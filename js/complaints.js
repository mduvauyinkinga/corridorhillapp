/**
 * complaints.js
 * ------------------------------------------------------------------
 * Complaint submission handler (Phase 2.2).
 *
 * - Guards the page for residents only.
 * - Loads the resident's room & unit automatically.
 * - Validates a category and at least one issue is selected.
 * - Validates and previews optional photo attachments.
 * - Uploads photos to Firebase Storage (with progress).
 * - Saves the complaint to Firestore with status "Submitted",
 *   a default "Low" priority, and the photo download URLs.
 * - Records the initial "Complaint Submitted" timeline event.
 */

import { auth, db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireRole } from "./auth.js";
import { renderNav } from "./nav.js";
import { addTimelineEvent } from "./timeline.js";
import { validateImageFile, uploadImage } from "./upload.js";
import {
  setButtonLoading,
  getFirebaseErrorMessage,
  showError,
  clearError,
  toast,
  $,
} from "./utils.js";

const form = $("#complaint-form");
const submitBtn = $("#submit-complaint-btn");
const issuesError = document.querySelector('[data-error="issues"]');
const categoryInput = $("#category");
const categoryError = document.querySelector('[data-error="category"]');
const photosInput = $("#photos");
const photosError = document.querySelector('[data-error="photos"]');
const photoPreview = $("#photo-preview");
const uploadProgress = $("#upload-progress");

// Files selected for upload (kept after preview rendering).
let selectedFiles = [];

/* --------------------------- Photo preview logic -------------------------- */

/**
 * Render thumbnail previews for the currently selected files and show
 * any validation errors for invalid files.
 */
function renderPhotoPreviews() {
  photoPreview.innerHTML = "";
  photosError.textContent = "";
  photosError.hidden = true;

  if (selectedFiles.length === 0) return;

  selectedFiles.forEach((file, index) => {
    const error = validateImageFile(file);
    if (error) {
      photosError.textContent = error;
      photosError.hidden = false;
    }

    const box = document.createElement("div");
    box.className = "photo-preview__item";

    const img = document.createElement("img");
    img.alt = `Photo ${index + 1}: ${file.name}`;
    img.className = error ? "photo-preview__img is-invalid" : "photo-preview__img";

    // Local object URL for immediate preview.
    img.src = URL.createObjectURL(file);
    box.appendChild(img);

    const label = document.createElement("span");
    label.className = "photo-preview__name";
    label.textContent = file.name;
    box.appendChild(label);

    photoPreview.appendChild(box);
  });
}

photosInput.addEventListener("change", () => {
  selectedFiles = Array.from(photosInput.files || []);
  renderPhotoPreviews();
});

/* ------------------------------ Initial load ------------------------------ */

async function init() {
  const profile = await requireRole(["resident"]);
  if (!profile) return;

  renderNav(profile);

  // Require a room before allowing complaints.
  if (!profile.roomId || !profile.unitId) {
    showError("You must choose a room before submitting a complaint.");
    submitBtn.disabled = true;
    return;
  }

  // Load room & unit into the preview.
  try {
    const roomSnap = await getDoc(doc(db, "rooms", profile.roomId));
    const unitSnap = await getDoc(doc(db, "units", profile.unitId));
    const room = roomSnap.exists() ? roomSnap.data() : null;
    const unit = unitSnap.exists() ? unitSnap.data() : null;

    $("#complaint-block").textContent = room?.block || "—";
    $("#complaint-room").textContent = room?.roomNumber ?? "—";
    $("#complaint-unit").textContent = unit?.unitName || "—";
  } catch (error) {
    console.error("[complaints] load room summary error:", error);
    showError("Could not load your room details. Please try again.");
  }
}

/* ------------------------------ Submission -------------------------------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  // Gather & validate category.
  const category = categoryInput.value;
  if (!category) {
    if (categoryError) {
      categoryError.textContent = "Please select a category to classify your issue.";
      categoryError.hidden = false;
    }
    return;
  }
  if (categoryError) {
    categoryError.textContent = "";
    categoryError.hidden = true;
  }

  // Gather selected issues.
  const selectedIssues = Array.from(
    form.querySelectorAll('input[name="issues"]:checked')
  ).map((cb) => cb.value);

  if (selectedIssues.length === 0) {
    if (issuesError) {
      issuesError.textContent = "Please select at least one issue affecting your room.";
      issuesError.hidden = false;
    }
    return;
  }
  if (issuesError) {
    issuesError.textContent = "";
    issuesError.hidden = true;
  }

  // Validate photos before uploading.
  const invalidPhoto = selectedFiles.find((f) => validateImageFile(f));
  if (invalidPhoto) {
    if (photosError) {
      photosError.textContent = validateImageFile(invalidPhoto);
      photosError.hidden = false;
    }
    return;
  }

  const notes = $("#notes").value.trim();

  // Get current user.
  const user = auth.currentUser;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const restore = setButtonLoading(submitBtn, "Submitting…");

  try {
    // Load profile for roomId/unitId (fresh).
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : null;

    // Upload photos first (if any) so we can store download URLs.
    const photoURLs = [];
    if (selectedFiles.length > 0) {
      uploadProgress.hidden = false;
      uploadProgress.textContent = "Uploading photos… 0%";

      for (const file of selectedFiles) {
        const url = await uploadImage(file, user.uid, (percent) => {
          uploadProgress.textContent = `Uploading photos… ${percent}%`;
        });
        photoURLs.push(url);
      }
    }

    const newComplaint = {
      residentId: user.uid,
      roomId: profile?.roomId || null,
      unitId: profile?.unitId || null,
      issues: selectedIssues,
      category: category,
      priority: "Low",
      photoURLs: photoURLs,
      notes: notes || "",
      status: "Submitted",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const complaintRef = await addDoc(collection(db, "complaints"), newComplaint);

    // Record the initial timeline event.
    await addTimelineEvent(complaintRef.id, {
      action: "Complaint Submitted",
      description: `Category: ${category}. Issues: ${selectedIssues.join(", ")}`,
      authorId: user.uid,
      authorName: profile?.name || "Resident",
      authorRole: "resident",
    });

    toast("Complaint submitted successfully!", "success");
    form.reset();
    selectedFiles = [];
    photoPreview.innerHTML = "";
    uploadProgress.hidden = true;
    setTimeout(() => {
      window.location.href = "tracking.html";
    }, 800);
  } catch (error) {
    console.error("[complaints] submit error:", error);
    showError(getFirebaseErrorMessage(error));
    restore();
  }
});

init();
