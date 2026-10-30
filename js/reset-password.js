/**
 * reset-password.js
 * ------------------------------------------------------------------
 * Password reset using Firebase Authentication's native:
 *   - verifyPasswordResetCode()
 *   - confirmPasswordReset()
 *
 * The reset code (oobCode) is passed via the URL query string
 * (?oobCode=xxx) from the Firebase reset email link.
 *
 * No SMTP, no Nodemailer, no custom tokens, no JWT.
 */

import { auth } from "./firebase.js";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  $,
  setButtonLoading,
  setFieldError,
  focusFirstError,
  showError,
  clearError,
  initPasswordToggles,
} from "./utils.js";

const form = $("#reset-password-form");
const submitBtn = $("#reset-btn");
const codeInput = $("#oobCode");
const passwordInput = $("#password");
const confirmInput = $("#confirm-password");

// Read the reset code from the URL (?oobCode=xxx).
const urlParams = new URLSearchParams(window.location.search);
const oobCode = urlParams.get("oobCode") || "";
codeInput.value = oobCode;

if (!oobCode) {
  showError("No reset code in the link. Please request a new reset link from the login page.");
  submitBtn.disabled = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const password = passwordInput.value;
  const confirmPassword = confirmInput.value;

  let valid = true;
  if (!password || password.length < 6) {
    setFieldError(passwordInput, "Password must be at least 6 characters.");
    valid = false;
  } else {
    setFieldError(passwordInput, "");
  }
  if (!confirmPassword) {
    setFieldError(confirmInput, "Please confirm your password.");
    valid = false;
  } else if (confirmPassword !== password) {
    setFieldError(confirmInput, "Passwords do not match.");
    valid = false;
  } else {
    setFieldError(confirmInput, "");
  }
  if (!valid) {
    focusFirstError(form);
    return;
  }

  const restore = setButtonLoading(submitBtn, "Resetting…");

  try {
    // 1. Verify the reset code is valid and not expired.
    await verifyPasswordResetCode(auth, oobCode);

    // 2. Confirm the new password.
    await confirmPasswordReset(auth, oobCode, password);

    form.innerHTML = `
      <div class="form__alert" role="alert">
        <strong>Password reset.</strong> Your new password is now active. You can sign in.
      </div>
      <p class="form__switch">
        <a href="login.html">Go to sign in</a>
      </p>
    `;
  } catch (error) {
    console.error("[reset-password] failed:", error);
    const code = error.code || "";
    let message = "Something went wrong. Please try again.";
    if (code === "auth/expired-action-code") {
      message = "This reset link has expired. Please request a new one.";
    } else if (code === "auth/invalid-action-code") {
      message = "This reset link is invalid. Please request a new one.";
    } else if (code === "auth/weak-password") {
      message = "Password must be at least 6 characters.";
    }
    showError(message);
    restore();
  }
});

// Wire up show/hide password toggles.
initPasswordToggles(passwordInput);
initPasswordToggles(confirmInput);
initPasswordStrength(passwordInput, document.querySelector("#password-strength"));