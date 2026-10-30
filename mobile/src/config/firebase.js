/**
 * config/firebase.js
 * ------------------------------------------------------------------
 * The ONLY place where Firebase is configured and initialised in the
 * mobile client — mirroring `js/firebase.js` on the website.
 *
 * ⚠️ SAME FIREBASE PROJECT AS THE WEBSITE
 * ------------------------------------------------------------------
 * These values are the exact production values from `js/firebase.js`.
 * The mobile app is a second client of the same project, the same
 * Authentication instance, the same Firestore database and the same
 * Storage bucket. There is deliberately no second backend.
 *
 * These keys are safe to ship in a client app (same as the website):
 * security is enforced by Firestore Security Rules and Storage Rules,
 * never by hiding these values. No service-account or admin credential
 * exists anywhere in this app.
 *
 * Platform differences vs the website (documented, no data model change):
 *   1. Auth persistence uses AsyncStorage instead of browser localStorage
 *      so the session survives an app restart (same user-facing behaviour
 *      as a browser refresh).
 *   2. Firestore forces long-polling. React Native's networking can fail
 *      to keep the WebChannel stream open on some Android devices; long
 *      polling is transport-only and does not affect data or rules.
 */

import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Same config as the website's js/firebase.js (project "corridormaintenanceapp"). */
export const firebaseConfig = {
  apiKey: "AIzaSyBc2abd0k9MHEi4P0mBTdCQ3Bg6gdZVj64",
  authDomain: "corridormaintenanceapp.firebaseapp.com",
  projectId: "corridormaintenanceapp",
  storageBucket: "corridormaintenanceapp.firebasestorage.app",
  messagingSenderId: "510490645459",
  appId: "1:510490645459:web:d5c9636d0edf0d99771526",
  measurementId: "G-H0E28XJ3GD",
};

const app = initializeApp(firebaseConfig);

/** Firebase Auth with a persisted session (AsyncStorage). */
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

/** Cloud Firestore (long polling transport for React Native reliability). */
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

/** Cloud Storage — used for complaint photo attachments. */
export const storage = getStorage(app);

/** Allowed email domain for resident registration (js/firebase.js). */
export const ALLOWED_DOMAIN = "@tut4life.ac.za";

export default app;
