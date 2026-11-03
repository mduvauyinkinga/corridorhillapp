# Corridor Hill Residence Maintenance System

A production-quality, static web application for reporting and managing
maintenance issues at Corridor Hill Residence. Built with **HTML5**, **CSS3**,
and **Vanilla JavaScript (ES6 Modules)** only.

Backend services: **Firebase Authentication** and **Cloud Firestore**.

---

## Tech Stack

- HTML5, CSS3, Vanilla JS (ES6 Modules) — no frameworks, no build tools.
- Firebase v10+ Modular SDK (loaded via CDN in `js/firebase.js`).
- Hosted on **GitHub Pages**.

---

## Getting Started

### 1. Create a Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project (e.g. `corridor-residence`).
3. Enable **Authentication** → **Email/Password** sign-in method.
4. Enable **Cloud Firestore** (production mode works fine).

### 2. Add your config

`js/firebase.js` is already configured for the `corridormaintenanceapp`
Firebase project. If you are setting up a fresh Firebase project, open
`js/firebase.js` and replace the config values with your own:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

> The current values in `js/firebase.js` are the intended production
> project values. These keys are safe to expose publicly. Security is
> enforced by **Cloud Firestore Security Rules** and **Storage Rules**,
> not by these keys. Do not commit other secrets.
>
> Phase 1 production-cleanup note: `404.html`, `favicon.svg`,
> `manifest.webmanifest`, and `robots.txt` were added; all pages now
> include `theme-color`, favicon, and manifest metadata using relative
> paths for GitHub Pages subpath hosting. Background image was renamed
> from `assets/images/corridor hill.jpeg` to
> `assets/images/corridor-hill.jpeg`. Admin utilities (`seed-tool.html`,
> `seed-*.js`, `verify-seed.js`, `migrate-units-to-two-beds.js`) are kept
> locally for initial setup only — see `TOOLS-README.md` and
> `.gitignore`; do not publish them to the resident-facing site.

### 3. Deploy Security Rules

Copy the contents of `firestore.rules` into:
Firebase Console → **Firestore Database** → **Rules** tab → Publish.

Also create the composite indexes listed in `firestore.indexes.json` if prompted.

Publish `storage.rules` separately in the Firebase Storage Rules tab.

### 3.1 Deploy the resident-deletion cleanup function

Occupancy is stored in `units`, while resident details are stored in `users`.
To make a bed available automatically when a manager deletes a
`users/{uid}` document (including a deletion made in the Firestore console),
deploy the included Cloud Function once. It also deletes that resident's
`unitInbox` copies:

```powershell
firebase use <your-firebase-project-id>
npm --prefix functions install
firebase deploy --only functions:releaseUnitsForDeletedResident
```

Install the Firebase CLI and sign in first if you have not already done so.

The function finds every bed with that resident's ID, sets `occupied` to
`false`, clears `residentId`, and removes that resident's inbox copies. The
management dashboard also repairs older orphaned beds when opened.

### 4. Seed rooms & units

Each Unit Number has Room Letters A, B, and C, with two residents allowed in
each room letter. This is stored as two bed slots per letter, for example
`F506-A-1` and `F506-A-2`. New projects should run `seed-units.js` to create
1,500 bed-slot documents. Existing projects with the old `F506-A` format must
run `migrate-units-to-two-beds.js` once as a management user before deploying
the updated room-selection page.

Rooms and units are **not** self-served by residents. You (management) must
seed them. Two standalone utilities generate the collections using Firestore
batch writes. Both are idempotent (safe to run multiple times) and require the
project to be served over HTTP because they are ES modules.

To run them, serve the project root (e.g. `python -m http.server 8080`) and
load each as a module via a temporary script tag on a page that shares the
Firebase config, or open the browser console on such a page.

### `seed-rooms.js` — creates the `rooms` collection (metadata only)

Generates one room document per room, using the room ID as the document ID
(e.g. `A101`). Room documents carry **room metadata only** — occupancy is NOT
stored here (it lives in the `units` collection).

```json
{
  "block": "A",
  "floor": 1,
  "roomNumber": 101,
  "roomId": "A101",
  "roomLabel": "A101",
  "createdAt": <serverTimestamp>
}
```

Total rooms generated = **250** (A/B/C = 36 each, D = 32, E/F = 55 each).

### `seed-units.js` — creates the `units` collection (occupancy)

Generates six bed-slot documents per room: Rooms `A`, `B`, and `C`, with two
beds in each (e.g. `A101-A-1` and `A101-A-2`). This collection manages
occupancy and resident assignments.

```json
{
  "unitId": "A101-A-1",
  "roomId": "A101",
  "unitName": "A",
  "bedNumber": 1,
  "occupied": false,
  "residentId": null
}
```

Total bed slots generated = **1,500** (250 rooms × 3 sub-rooms × 2 beds).

### Room ↔ unit relationship

```
rooms
    A101
    A102
    ...
    F513

↓ (each room has 3 sub-rooms, with 2 beds each)

units
    A101-A-1, A101-A-2
    A101-B-1, A101-B-2
    A101-C-1, A101-C-2
```

### 5. Create management accounts

Residents register themselves with a `@tut4life.ac.za` email. For the two
management accounts, create them **manually**:

1. Firebase Console → **Authentication** → Add user (Gmail/iCloud email + password).
2. In **Firestore**, create a matching doc in `users/{uid}`:
   ```json
   {
     "uid": "<same uid as auth>",
     "name": "Manager Name",
     "email": "manager@gmail.com",
     "role": "management",
     "createdAt": <timestamp>
   }
   ```

### 6. Run locally / deploy

Because ES6 modules require a web server (not `file://`), serve the folder:

```bash
# Option A: Python
python -m http.server 8080

# Option B: VS Code "Live Server" extension
# Right-click index.html → Open with Live Server
```

Then open `http://localhost:8080`.

For **GitHub Pages** deployment, push the repo and enable Pages in repo settings
pointing to the `main` branch root.

---

## Firestore Data Model

### Location hierarchy

The resident-facing location is **Block → Unit Number → Room Letter**. For
example, Block F, Unit Number 506, Room Letter C. Existing identifiers and
records are preserved: `rooms/F506` remains the parent unit record, and
`units/F506-C-1` / `units/F506-C-2` remain the two bed-slot records for Room C.
The `rooms` collection's `roomNumber` field continues to hold the existing
numeric unit number; no renumbering or data migration is required.

```
users/{uid}
  name, studentNumber, email, role, roomId, unitId, createdAt

rooms/{roomId}
  block, roomNumber

units/{unitId}
  roomId, unitName (A/B/C), occupied, residentId

complaints/{complaintId}
  residentId, roomId, unitId, issues[], status, createdAt, updatedAt

unitAnnouncements/{announcementId}
  roomId, message, authorName, createdAt

unitMessages/{messageId}
  roomId, block, unitNumber, roomLetter, recipientUids,
  message, authorId, authorName, createdAt

users/{uid}/unitInbox/{messageId}
  messageId, roomId, block, unitNumber, roomLetter,
  message, authorId, authorName, createdAt
```

`units/{unitId}` continues to represent an individual bed slot and occupancy.
New broadcasts store a private canonical message and atomically create an inbox
copy for each selected resident. `roomLetter: null` targets every room letter
in the unit; `A`, `B`, or `C` targets only residents currently assigned to that
room letter. Existing `unitAnnouncements` are retained as legacy unit-wide
updates and do not need to be migrated.

The `unitMessages` indexes in `firestore.indexes.json` support management
history. Resident inboxes are per-user subcollections and use the standard
`createdAt` index.

Publish the updated Firestore rules and indexes before deploying clients that
send `unitMessages`; no existing location documents or room assignments need
to be migrated. Inbox messages update live while the resident is signed in to
the web or mobile app. Push notifications for closed apps are not configured
by this change and require web push and mobile push credentials.

---

## User Roles

| Role        | Capabilities |
|-------------|--------------|
| **resident** | Register, login, join a room, submit & track complaints, logout |
| **management** | Login, view all complaints, update status, view residents, logout |

---

## File Structure

```
/
├── index.html
├── login.html
├── register.html
├── choose-room.html
├── dashboard.html
├── complaint.html
├── tracking.html
├── management.html
├── css/
│   ├── style.css       (base/global)
│   ├── auth.css        (login/register/choose-room)
│   ├── forms.css       (form components)
│   ├── dashboard.css   (dashboard)
│   ├── management.css  (management table)
│   └── responsive.css  (breakpoints)
├── js/
│   ├── firebase.js     (config + init)
│   ├── utils.js        (helpers)
│   ├── auth.js         (guards + role helpers)
│   ├── nav.js          (shared nav + logout)
│   ├── register.js
│   ├── login.js
│   ├── choose-room.js
│   ├── dashboard.js
│   ├── complaints.js
│   ├── tracking.js
│   └── management.js
├── assets/images/
├── assets/icons/
├── firestore.rules
└── firestore.indexes.json
```

---

## Mobile App (React Native / Expo)

The mobile app (`mobile/`) is a native companion to the web app, sharing the
same Firebase backend.

- **Navigator**: `mobile/src/navigation/RootNavigator.js` wires the stacks
  by role (resident → bottom tabs, management → bottom tabs, unauthenticated →
  auth stack).
- **Theme**: `mobile/src/theme/` is the design system. It has been refactored
  to reference `tokens.js`, the shared design-token object, instead of
  duplicating brand/spacing/radius values.

### Run the mobile app

```bash
cd mobile
npm install
npx expo start
```

---

## Phase 1 Features

- Home page with hero/about/features.
- Resident registration (validates `@tut4life.ac.za` email).
- Login with role-based redirect.
- Choose room (browse block → room → available unit).
- Resident dashboard (name, room, unit, complaint stats, expandable complaint and message sections).
- Submit complaint (multi-select issues, defaults to **Pending**).
- Complaint tracking (resident sees only their own).
- Management dashboard with a clickable overview for residents, units, occupancy, and complaint statuses.

---

## Naming Conventions

- Firestore document IDs:
  - `users/{uid}` — the Auth UID.
  - `rooms/{roomId}` — a stable room code (e.g. `R101`).
  - `units/{unitId}` — a stable unit code (e.g. `U101A`).
  - `complaints/{complaintId}` — auto-generated by `addDoc`.
- Statuses: `Pending` → `In Progress` → `Completed`.
