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
deploy the included Cloud Function once:

```powershell
firebase use <your-firebase-project-id>
npm --prefix functions install
firebase deploy --only functions:releaseUnitsForDeletedResident
```

Install the Firebase CLI and sign in first if you have not already done so.

The function finds every unit with that resident's ID, sets `occupied` to
`false`, and clears `residentId`. The management dashboard also repairs any
older orphaned bed records when it is opened, but the function is what keeps
availability current immediately for all users.

### 4. Seed rooms & units

Each parent room has Rooms A, B, and C, with two residents allowed in each
lettered room. This is stored as two bed slots per letter, for example
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
```

Using a separate `units` collection keeps documents small and makes it trivial
to query available units (`occupied == false`).

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

## Phase 1 Features

- Home page with hero/about/features.
- Resident registration (validates `@tut4life.ac.za` email).
- Login with role-based redirect.
- Choose room (browse block → room → available unit).
- Resident dashboard (name, room, unit, actions).
- Submit complaint (multi-select issues, defaults to **Pending**).
- Complaint tracking (resident sees only their own).
- Management dashboard (all complaints, status updates).

---

## Naming Conventions

- Firestore document IDs:
  - `users/{uid}` — the Auth UID.
  - `rooms/{roomId}` — a stable room code (e.g. `R101`).
  - `units/{unitId}` — a stable unit code (e.g. `U101A`).
  - `complaints/{complaintId}` — auto-generated by `addDoc`.
- Statuses: `Pending` → `In Progress` → `Completed`.
