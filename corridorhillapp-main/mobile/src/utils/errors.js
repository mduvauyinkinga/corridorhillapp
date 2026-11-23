/**
 * utils/errors.js
 * ------------------------------------------------------------------
 * Human-readable Firebase error messages — a direct port of
 * `getFirebaseErrorMessage()` in the website's `js/utils.js`, extended
 * with the storage errors the mobile client can hit while uploading
 * complaint photos.
 */

const MESSAGES = {
  "auth/email-already-in-use": "This email is already registered.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/invalid-credential": "Incorrect email or password. Please try again.",
  "auth/user-disabled": "This account has been disabled. Contact management.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/operation-not-allowed": "Email/password sign-in is not enabled for this project.",
  "unavailable": "You appear to be offline. Check your connection and try again.",
  "permission-denied": "You do not have permission to perform this action.",
  "not-found": "The requested record no longer exists.",
  "failed-precondition": "The request could not be completed. Please try again.",
  "storage/unauthorized": "Photo upload was rejected by the server. Please try again.",
  "storage/retry-limit-exceeded": "Photo upload timed out. Please try again on a stronger connection.",
  "storage/canceled": "Photo upload was cancelled.",
  "storage/quota-exceeded": "Photo storage quota exceeded. Contact management.",
};

/** Extract a human-readable message from a Firebase (or plain) error. */
export function getFirebaseErrorMessage(error) {
  const code = error?.code || "";
  if (MESSAGES[code]) return MESSAGES[code];
  if (typeof error?.message === "string" && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

/** True when the error looks like a connectivity problem. */
export function isOfflineError(error) {
  const code = error?.code || "";
  return code === "unavailable" || code === "auth/network-request-failed";
}
