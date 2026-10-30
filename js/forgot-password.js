/**
 * forgot-password.js
 * ------------------------------------------------------------------
 * Password reset request using Firebase Authentication's native
 * sendPasswordResetEmail().
 *
 * No SMTP, no Nodemailer, no custom tokens, no JWT.
 * Firebase handles the reset email delivery and code generation.
 */

import { auth } from "./firebase.js";
import {
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  $,
  setButtonLoading,
  setFieldError,
  focusFirstError,
  showError,
  clearError,
  validateRequired,
} from "./utils.js";

const form = $("#forgot-password-form");
const submitBtn = $("#send-reset-btn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const emailInput = $("#email");
  const email = emailInput.value.trim();

  let valid = true;
  if (!validateRequired(emailInput, "Email")) valid = false;
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError(emailInput, "Please enter a valid email address.");
    valid = false;
  }
  if (!valid) {
    focusFirstError(form);
    return;
  }

  const restore = setButtonLoading(submitBtn, "Sending…");

  try {
    // Firebase Authentication native password reset.
    // Firebase sends the reset email to the address if an account exists.
    // Anti-enumeration: Firebase does not reveal whether the email exists.
    await sendPasswordResetEmail(auth, email);

    // Always show the same generic success message (anti-enumeration).
    form.innerHTML = `
      <div class="form__alert" role="alert">
        <strong>Reset link sent.</strong> If an account exists for <strong>${email}</strong>,
        a password-reset link has been sent to that email. It expires in 1 hour.
      </div>
      <p class="form__switch">
        Remember your password? <a href="login.html">Sign in</a>
      </p>
    `;
  } catch (error) {
    console.error("[forgot-password] failed:", error);
    // Map common Firebase auth errors to user-friendly messages.
    const code = error.code || "";
    let message = "Something went wrong. Please try again.";
    if (code === "auth/invalid-email") {
      message = "Please enter a valid email address.";
    } else if (code === "auth/too-many-requests") {
      message = "Too many attempts. Please try again later.";
    } else if (code === "auth/missing-email") {
      message = "Email is required.";
    }
    showError(message);
    restore();
  }
});