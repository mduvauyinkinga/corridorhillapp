/**
 * login.js
 * ------------------------------------------------------------------
 * Login handler. Authenticates with Firebase, loads the user's
 * Firestore profile, and redirects based on role:
 *   - resident   → dashboard.html
 *   - management → management.html
 */

import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  validateRequired,
  setFieldError,
  focusFirstError,
  setButtonLoading,
  getFirebaseErrorMessage,
  showError,
  clearError,
  $,
} from "./utils.js";

const form = $("#login-form");
const submitBtn = $("#login-btn");

/**
 * Redirect the user to the appropriate page based on their role.
 * If the profile is missing, send them to choose-room.
 */
function redirectByRole(profile) {
  if (!profile) {
    window.location.href = "choose-room.html";
    return;
  }
  if (profile.role === "management") {
    window.location.href = "management.html";
  } else {
    // Residents without a room are sent to choose-room.
    window.location.href = profile.roomId ? "dashboard.html" : "choose-room.html";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const email = $("#email").value.trim();
  const password = $("#password").value;

  const emailInput = $("#email");
  const passwordInput = $("#password");

  let valid = true;
  if (!validateRequired(emailInput, "Email")) valid = false;
  if (!validateRequired(passwordInput, "Password")) valid = false;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError(emailInput, "Please enter a valid email address.");
    valid = false;
  }
  if (!valid) {
    focusFirstError(form);
    return;
  }

  const restore = setButtonLoading(submitBtn, "Signing in...");

  try {
    // 1. Authenticate.
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // 2. Load the user profile.
    const userSnap = await getDoc(doc(db, "users", uid));
    const profile = userSnap.exists() ? { ...userSnap.data(), uid } : null;

    // 3. Role-based redirect.
    redirectByRole(profile);
  } catch (error) {
    console.error("[login] Login failed:", error);
    showError(getFirebaseErrorMessage(error));
    restore();
  }
});
