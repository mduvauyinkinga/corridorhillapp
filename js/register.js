/**
 * register.js
 * ------------------------------------------------------------------
 * Resident registration handler.
 *
 * 1. Validates the form (name, student number, TUT email, passwords).
 * 2. Creates a Firebase Authentication account.
 * 3. Creates a matching Firestore `users/{uid}` document with
 *    role = "resident".
 * 4. Redirects to choose-room.html.
 */

import { auth, db, ALLOWED_DOMAIN } from "./firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  validateRequired,
  validateEmailDomain,
  setFieldError,
  focusFirstError,
  setButtonLoading,
  getFirebaseErrorMessage,
  showError,
  clearError,
  $,
  initPasswordStrength,
  initPasswordToggles,
} from "./utils.js";

const form = $("#register-form");
const submitBtn = $("#register-btn");
const passwordInput = $("#password");
const strengthContainer = $("#password-strength");

/**
 * Validate the full form. Returns true if all fields are valid.
 */
function validateForm(data) {
  let valid = true;

  const nameInput = $("#full-name");
  const studentInput = $("#student-number");
  const emailInput = $("#email");
  const passwordInput = $("#password");
  const confirmInput = $("#confirm-password");

  // Full name
  if (!validateRequired(nameInput, "Full name")) valid = false;

  // Student number
  if (!validateRequired(studentInput, "Student number")) valid = false;

  // Email
  if (!validateRequired(emailInput, "Email")) {
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    setFieldError(emailInput, "Please enter a valid email address.");
    valid = false;
  } else if (!validateEmailDomain(data.email.trim(), ALLOWED_DOMAIN)) {
    setFieldError(
      emailInput,
      `Registration is only allowed with ${ALLOWED_DOMAIN} email addresses.`
    );
    valid = false;
  } else {
    setFieldError(emailInput, "");
  }

  // Password
  if (!validateRequired(passwordInput, "Password")) {
    valid = false;
  } else if (data.password.length < 6) {
    setFieldError(passwordInput, "Password must be at least 6 characters.");
    valid = false;
  } else {
    setFieldError(passwordInput, "");
  }

  // Confirm password
  if (!validateRequired(confirmInput, "Confirm password")) {
    valid = false;
  } else if (data.confirmPassword !== data.password) {
    setFieldError(confirmInput, "Passwords do not match.");
    valid = false;
  } else {
    setFieldError(confirmInput, "");
  }

  return valid;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const data = {
    fullName: $("#full-name").value.trim(),
    studentNumber: $("#student-number").value.trim(),
    email: $("#email").value.trim(),
    password: $("#password").value,
    confirmPassword: $("#confirm-password").value,
  };

  if (!validateForm(data)) {
    focusFirstError(form);
    return;
  }

  const restore = setButtonLoading(submitBtn, "Creating account...");

  try {
    // 1. Create the Authentication account.
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      data.email,
      data.password
    );
    const uid = userCredential.user.uid;

    // 2. Create the Firestore user document.
    await setDoc(doc(db, "users", uid), {
      uid,
      name: data.fullName,
      studentNumber: data.studentNumber,
      email: data.email.toLowerCase(),
      role: "resident",
      roomId: null,
      unitId: null,
      createdAt: serverTimestamp(),
    });

    // 3. Redirect to choose-room.
    window.location.href = "choose-room.html";
  } catch (error) {
    console.error("[register] Registration failed:", error);
    showError(getFirebaseErrorMessage(error));
    restore();
  }
});

// Initialize password strength meter.
initPasswordStrength(passwordInput, strengthContainer);
// Wire up show/hide password toggles.
initPasswordToggles(passwordInput);
initPasswordToggles(confirmInput);
