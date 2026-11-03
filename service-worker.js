/**
 * service-worker.js
 * ------------------------------------------------------------------
 * Corridor Hill Residence Maintenance System — PWA Service Worker.
 *
 * Caching strategy:
 *   - STATIC_CACHE: App shell (HTML, CSS, JS, images, manifest) — cached on install.
 *   - RUNTIME_CACHE: Not used for any dynamic API/Firestore data.
 *
 * SECURITY: Never caches sensitive resident information, management
 * dashboards, private complaint records, authentication data, or any
 * protected information. Only static, public assets are cached.
 *
 * The offline fallback page is shown only for navigation requests
 * when the network is unavailable.
 */

const STATIC_CACHE = "corridor-hill-static-v6";
const OFFLINE_URL = "./offline.html";

// Static assets to cache on install. These are all public, non-sensitive resources.
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./register.html",
  "./forgot-password.html",
  "./reset-password.html",
  "./choose-room.html",
  "./dashboard.html",
  "./complaint.html",
  "./tracking.html",
  "./management.html",
  "./rules.html",
  "./offline.html",
  "./404.html",
  "./manifest.webmanifest",
  "./assets/images/corridor-logo.jpeg",
  "./assets/images/corridor-hill.jpeg",
  "./assets/images/corridorhill.jpg",
  "./css/style.css",
  "./css/auth.css",
  "./css/dashboard.css",
  "./css/forms.css",
  "./css/management.css",
  "./css/responsive.css",
  "./js/firebase.js",
  "./js/utils.js",
  "./js/auth.js",
  "./js/nav.js",
  "./js/lightbox.js",
  "./js/login.js",
  "./js/register.js",
  "./js/forgot-password.js",
  "./js/reset-password.js",
  "./js/choose-room.js",
  "./js/dashboard.js",
  "./js/unit-messages.js",
  "./js/complaints.js",
  "./js/timeline.js",
  "./js/tracking.js",
  "./js/management.js",
  "./js/upload.js",
  "./js/modal.js",
  "./js/rules.js",
];

// Install: cache the static app shell.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((error) => {
        console.warn("[sw] Failed to cache some static assets:", error);
      });
    })
  );
  // Force the waiting service worker to become the active worker immediately.
  self.skipWaiting();
});

// Activate: clean up old caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve static assets from cache, fall back to network.
// For navigation requests (HTML pages), fall back to offline.html when offline.
// Never cache Firestore, Firebase Auth, or Firebase Storage responses.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests. Ignore Firebase/CDN/external requests.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Ignore non-GET requests.
  if (request.method !== "GET") {
    return;
  }

  // For navigation requests (HTML pages), use network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // For static assets: cache-first, then network.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        // Only cache successful responses for static assets.
        if (response.ok && response.type === "basic") {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// Listen for messages from the client (e.g., to skip waiting on update).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});