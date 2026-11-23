/**
 * seed-auth.js
 * ------------------------------------------------------------------
 * Shared auth guard for the seed & verification utilities.
 *
 * Firestore Security Rules gate writes to `rooms` and `units` behind
 * `isManagement()`. Therefore these utilities MUST run while the
 * current Firebase Auth user is a **management** account.
 *
 * This module exposes `requireManagement()` which:
 *   - waits for the auth state to resolve,
 *   - returns a promise that REJECTS with a clear error if the user
 *     is not signed in OR is not a management user.
 *
 * It is used by seed-rooms.js, seed-units.js and verify-seed.js so
 * the guard logic is defined once and consistent everywhere.
 */

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Resolve the currently signed-in Auth user (or null).
 */
function getSignedInUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Ensure the current user is authenticated AND has the management role.
 *
 * @returns {Promise<string>} resolves with the management user's UID.
 * @throws  {Error}           if not signed in or not management.
 */
export async function requireManagement() {
  const user = await getSignedInUser();

  if (!user) {
    throw new Error(
      "NOT AUTHORIZED: You must be signed in to run this utility. " +
        "Please log in with a management account first."
    );
  }

  let profile = null;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) profile = snap.data();
  } catch (error) {
    throw new Error(
      "Could not verify your role. Check your network connection and try again. " +
        `(${error.code || error.message})`
    );
  }

  if (!profile) {
    throw new Error(
      "NOT AUTHORIZED: No profile found for this account. " +
        "A management user document must exist in `users/{uid}`."
    );
  }

  if (profile.role !== "management") {
    throw new Error(
      `NOT AUTHORIZED: This utility requires a management account, ` +
        `but the current user's role is "${profile.role || "unknown"}".`
    );
  }

  return user.uid;
}
