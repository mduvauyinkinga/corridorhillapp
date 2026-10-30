/**
 * firebase.js
 * ------------------------------------------------------------------
 * Central Firebase SDK initialization and exports.
 *
 * This is the ONLY place where Firebase is configured and initialized.
 * All other modules import the services they need from here.
 *
 * ⚠️ PLACEHOLDER CONFIG
 * ------------------------------------------------------------------
 * Replace the values below with your own Firebase web app configuration.
 * You can find these in the Firebase Console:
 *   Project Settings → Your apps → Web app → Config
 *
 * This is safe to expose publicly (Firebase security is enforced by
 * Cloud Firestore Security Rules, not by these keys).
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBc2abd0k9MHEi4P0mBTdCQ3Bg6gdZVj64",
  authDomain: "corridormaintenanceapp.firebaseapp.com",
  projectId: "corridormaintenanceapp",
  storageBucket: "corridormaintenanceapp.firebasestorage.app",
  messagingSenderId: "510490645459",
  appId: "1:510490645459:web:d5c9636d0edf0d99771526",
  measurementId: "G-H0E28XJ3GD"
};

// Initialize Firebase once.
const app = initializeApp(firebaseConfig);

// Export shared service instances.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/** Allowed email domain for resident registration. */
export const ALLOWED_DOMAIN = "@tut4life.ac.za";
