/**
 * utils.js
 * ------------------------------------------------------------------
 * Reusable utility helpers: DOM queries, form validation, loading
 * states, error handling, date formatting, and toasts.
 *
 * Every page imports the helpers it needs to avoid duplicate code.
 */

/* ---------------------------------- DOM ---------------------------------- */

/** Query a single element by selector. Throws if not found. */
export function $(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) {
    console.warn(`[utils] Element not found: "${selector}"`);
  }
  return el;
}

/** Query multiple elements by selector and return an array. */
export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/* ------------------------------ Form helpers ------------------------------ */

/** Read all fields within a form into a plain object keyed by name. */
export function serializeForm(form) {
  const data = {};
  const formData = new FormData(form);
  formData.forEach((value, key) => {
    data[key] = value;
  });
  return data;
}

/** Set/clear an inline error message on a field's error container. */
export function setFieldError(input, message) {
  const key = input.dataset.errorKey || input.name;
  const errorEl = document.querySelector(`[data-error="${key}"]`);
  if (errorEl) {
    errorEl.textContent = message || "";
    errorEl.hidden = !message;
  }
  input.classList.toggle("is-invalid", Boolean(message));
}

/**
 * Validate that a field is non-empty.
 * Returns true if valid, otherwise shows the field error.
 */
export function validateRequired(input, label) {
  if (!input.value.trim()) {
    setFieldError(input, `${label} is required.`);
    return false;
  }
  setFieldError(input, "");
  return true;
}

/**
 * Validate an email domain against an allowed domain.
 * Supported when the domain string includes a leading "@".
 */
export function validateEmailDomain(email, allowedDomain) {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return false;
  const domain = email.slice(atIndex);
  return domain.toLowerCase() === allowedDomain.toLowerCase();
}

/* ------------------------------ Loading state ----------------------------- */

/**
 * Show a loading state on a button and disable it.
 * Returns a function to restore the button's original label/state.
 */
export function setButtonLoading(button, loadingText = "Please wait...") {
  const original = button.textContent;
  button.dataset.originalText = original;
  button.disabled = true;
  button.textContent = loadingText;
  button.classList.add("is-loading");
  return () => {
    button.disabled = false;
    button.textContent = button.dataset.originalText || original;
    button.classList.remove("is-loading");
  };
}

/* ------------------------------- Toasts ----------------------------------- */

/** Show a small toast notification at the bottom of the screen. */
export function toast(message, type = "info", duration = 3500) {
  let container = $("#toast-container");
  if (!container) {
    // Create a container on the fly if missing.
    const div = document.createElement("div");
    div.id = "toast-container";
    div.className = "toast-container";
    div.setAttribute("aria-live", "polite");
    document.body.appendChild(div);
    container = $("#toast-container");
  }

  const toastEl = document.createElement("div");
  toastEl.className = `toast toast--${type}`;
  toastEl.setAttribute("role", "status");
  toastEl.textContent = message;
  container.appendChild(toastEl);

  // Auto-dismiss.
  setTimeout(() => {
    toastEl.classList.add("toast--hide");
    setTimeout(() => toastEl.remove(), 300);
  }, duration);
}

/* ----------------------------- Date formatting ---------------------------- */

/** Format a Firestore timestamp / Date into a readable local string. */
export function formatDate(dateLike) {
  if (!dateLike) return "—";
  let date;
  if (dateLike instanceof Date) {
    date = dateLike;
  } else if (typeof dateLike.toDate === "function") {
    date = dateLike.toDate(); // Firestore Timestamp
  } else if (dateLike.seconds) {
    date = new Date(dateLike.seconds * 1000);
  } else {
    date = new Date(dateLike);
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a Firestore timestamp / Date into a readable local date + time. */
export function formatDateTime(dateLike) {
  if (!dateLike) return "—";
  let date;
  if (dateLike instanceof Date) {
    date = dateLike;
  } else if (typeof dateLike.toDate === "function") {
    date = dateLike.toDate();
  } else if (dateLike.seconds) {
    date = new Date(dateLike.seconds * 1000);
  } else {
    date = new Date(dateLike);
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Compare a complaint's estimated completion value against "now".
 * Returns true when the complaint is not Completed and its estimated
 * completion date (or timestamp) is in the past.
 */
export function isOverdue(complaint) {
  if (!complaint) return false;
  if (normalizeStatus(complaint.status) === "Completed") return false;
  const est = complaint.estimatedCompletion;
  if (!est) return false;
  let date;
  if (typeof est.toDate === "function") {
    date = est.toDate();
  } else if (est.seconds) {
    date = new Date(est.seconds * 1000);
  } else if (est instanceof Date) {
    date = est;
  } else if (typeof est === "string") {
    date = new Date(est);
  } else {
    return false;
  }
  return date.getTime() < Date.now();
}

/* --------------------------- Status / badges ------------------------------ */

/**
 * Valid complaint statuses, in workflow order.
 *
 * Backwards compatibility: legacy complaints stored with status "Pending"
 * are displayed as "Submitted" (see the normalizeStatus helper below).
 */
export const COMPLAINT_STATUSES = [
  "Submitted",
  "Received",
  "Assigned",
  "In Progress",
  "Waiting for Parts",
  "Completed",
  "Cancelled",
];

/**
 * Normalize a stored complaint status for display.
 * Legacy "Pending" maps to "Submitted" so the new workflow stays consistent.
 */
export function normalizeStatus(status) {
  if (status === "Pending") return "Submitted";
  return status && COMPLAINT_STATUSES.includes(status) ? status : "Submitted";
}

/**
 * Map a complaint status string to a CSS badge class.
 * Falls back to the "Submitted" badge for unknown statuses.
 */
export function statusBadge(status) {
  const s = normalizeStatus(status);
  const map = {
    Submitted: "badge badge--pending",
    Received: "badge badge--received",
    Assigned: "badge badge--assigned",
    "In Progress": "badge badge--in-progress",
"Waiting for Parts": "badge badge--waiting",
    Completed: "badge badge--completed",
    Cancelled: "badge badge--cancelled",
  };
  return map[s] || "badge badge--pending";
}

/* --------------------------- Categories & priority ------------------------ */

/** Valid complaint categories. */
export const COMPLAINT_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "Furniture",
  "Appliances",
  "Security",
  "Windows & Doors",
  "Cleaning",
  "Other",
];

/** Valid priority levels, in severity order. */
export const PRIORITIES = ["Low", "Medium", "High", "Emergency"];

/**
 * Normalize a stored priority for display.
 * Unknown / missing values fall back to "Low".
 */
export function normalizePriority(priority) {
  return priority && PRIORITIES.includes(priority) ? priority : "Low";
}

/** Map a priority level to a CSS badge class. */
export function priorityBadge(priority) {
  const p = normalizePriority(priority);
  const map = {
    Low: "badge badge--priority badge--priority-low",
    Medium: "badge badge--priority badge--priority-medium",
    High: "badge badge--priority badge--priority-high",
    Emergency: "badge badge--priority badge--priority-emergency",
  };
  return map[p] || map.Low;
}

/* --------------------------------- Errors --------------------------------- */

/** Extract a human-readable message from a Firebase error. */
export function getFirebaseErrorMessage(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/too-many-requests":
      "Too many attempts. Please try again later.",
    "auth/network-request-failed":
      "Network error. Check your connection and try again.",
  };
  return map[code] || error?.message || "Something went wrong. Please try again.";
}

/** Show an error alert region if present, otherwise log to console. */
export function showError(message) {
  const alertEl = $("#form-alert");
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.hidden = false;
  } else {
    console.error(message);
  }
}

/** Clear a form-level alert. */
export function clearError() {
  const alertEl = $("#form-alert");
  if (alertEl) {
    alertEl.textContent = "";
    alertEl.hidden = true;
  }
}
