/**
 * auth.js
 * ------------------------------------------------------------------
 * Route guarding + role helpers built on top of Firebase Auth and
 * the users collection.
 *
 * Provides:
 *   - requireAuth()      : redirect to login if not signed in.
 *   - requireRole()      : redirect based on required role(s).
 *   - getCurrentUser()   : returns the signed-in Auth user.
 *   - getUserProfile()   : fetches the Firestore users/{uid} doc.
 *   - logout()           : signs out and redirects to index.
 */

import { auth, db } from "./firebase.js";
import {
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/**
 * Wait for the current authentication state to resolve.
 * Resolves with the Auth user or null.
 */
export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Fetch the Firestore profile document for a user UID.
 * Returns the document data plus its id, or null if not found.
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ...snap.data(), uid: snap.id };
    }
    return null;
  } catch (error) {
    console.error("[auth] getUserProfile error:", error);
    throw error;
  }
}

/**
 * Route guard: ensure the user is authenticated.
 * If not signed in, redirect to login.html.
 * Returns the signed-in user (or null if redirected).
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

/**
 * Route guard: ensure the user has one of the allowed roles.
 * Redirects to the appropriate home for the role if not allowed.
 * Returns the user profile, or null if redirected.
 */
export async function requireRole(allowedRoles) {
  const user = await requireAuth();
  if (!user) return null;

  const profile = await getUserProfile(user.uid);
  if (!profile) {
    // No profile yet — force them to choose a room / complete setup.
    window.location.href = "choose-room.html";
    return null;
  }

  if (!allowedRoles.includes(profile.role)) {
    // Redirect to the correct area for their actual role.
    window.location.href = profile.role === "management"
      ? "management.html"
      : "choose-room.html";
    return null;
  }

  // A resident must have a room before using resident pages.
  if (profile.role === "resident" && !profile.roomId) {
    window.location.href = "choose-room.html";
    return null;
  }

  return profile;
}

/**
 * Sign out the current user and redirect to the home page.
 */
export async function logout() {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("[auth] logout error:", error);
    alert("Could not log out. Please try again.");
  }
}
