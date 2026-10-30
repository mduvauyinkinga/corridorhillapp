/**
 * index.js
 * ------------------------------------------------------------------
 * React Native entry point for the Corridor Hill mobile client.
 *
 * `react-native-get-random-values` MUST be imported first: the Firebase
 * Auth React Native build relies on `crypto.getRandomValues`, which is
 * not available in React Native's JavaScript runtime by default.
 *
 * Firebase is initialised in `src/config/firebase.js` (initialised once,
 * exactly like `js/firebase.js` on the website).
 */

import "react-native-get-random-values";

import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
