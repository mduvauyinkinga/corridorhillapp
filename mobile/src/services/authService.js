/**
 * services/authService.js
 * ------------------------------------------------------------------
 * Firebase Authentication + user profile access.
 *
 * Direct port of the website's authentication behaviour:
 *   - js/login.js     → sign in, then read users/{uid}, then route by role
 *   - js/register.js  → create the Auth account, then create users/{uid}
 *                       with role "resident", roomId/unitId = null
 *   - js/auth.js      → getUserProfile(uid), sign out
 *
 * No second authentication system is used: the mobile client signs in
 * against the same Firebase Auth instance as the website, so an account
 * works on both clients simultaneously.
 */

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "../config/firebase";

/**
 * Subscribe to Firebase Auth state changes.
 * Returns the unsubscribe function (used by the AuthProvider).
 */
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

/** The currently signed-in Firebase Auth user, or null. */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Fetch the Firestore profile document for a user UID.
 * Returns the document data plus its id, or null when no profile exists —
 * the same contract as `getUserProfile()` in js/auth.js.
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? { ...snapshot.data(), uid: snapshot.id } : null;
}

/**
 * Sign in with email + password and load the profile.
 * Returns { user, profile } — profile may be null (no users/{uid} yet),
 * which the navigation layer treats as "needs room setup", exactly like
 * the website's requireRole() guard.
 */
export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await getUserProfile(credential.user.uid);
  return { user: credential.user, profile };
}

/**
 * Create a resident account.
 * 1. createUserWithEmailAndPassword (same provider as the website)
 * 2. setDoc users/{uid} with role "resident" and no room assigned
 *
 * The written fields are exactly the ones js/register.js writes, which is
 * also what the `users` create rule in firestore.rules validates:
 *   uid == request.auth.uid, role == 'resident', roomId == null, unitId == null
 */
export async function registerResident({ fullName, studentNumber, email, password }) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const uid = credential.user.uid;

  await setDoc(doc(db, "users", uid), {
    uid,
    name: fullName.trim(),
    studentNumber: studentNumber.trim(),
    email: email.trim().toLowerCase(),
    role: "resident",
    roomId: null,
    unitId: null,
    createdAt: serverTimestamp(),
  });

  return uid;
}

/** Sign out of Firebase Auth (js/auth.js `logout`). */
export async function signOutUser() {
  await signOut(auth);
}

/**
 * Where should this account land after authentication?
 * Mirrors redirectByRole() in js/login.js and requireRole() in js/auth.js:
 *   management                     → management area
 *   resident with a room           → resident dashboard
 *   resident without a room        → choose room
 *   missing profile                → choose room
 */
export function resolveHome({ profile }) {
  if (!profile) return { destination: "choose-room" };
  if (profile.role === "management") return { destination: "management" };
  return { destination: profile.roomId ? "dashboard" : "choose-room" };
}
