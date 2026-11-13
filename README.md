# 10X Agency CRM (React demo)

The 10X Agency CRM as a standalone React app. Same screens, design and behaviour as the live CRM, but it runs
on realistic dummy data, with no backend and no database. Everything you add, edit or delete is saved in your
browser, so it is still there after a reload.

Built with React 18, React Router 6 and Vite 5. No other libraries.

## Run it

Requirements: Node.js 18 or newer.

```bash
npm install
npm run dev       # http://localhost:5173 with live reload
npm run build     # production files in dist/ (works from any folder or static host)
npm run preview   # serve the built dist/ locally
npm run check     # quick self-check of the mock service layer (no browser needed)
```

## Demo accounts

Every account uses the password **Demo@12345**. What you see depends on the role, exactly as in the real CRM.

| Email | Role | Good for trying |
|---|---|---|
| aarav@the10xagency.in | Super Admin | Everything: Permissions, roles, Recycle Bin (including permanent delete), password resets |
| priya@the10xagency.in | Admin | Members, activity log, password resets |
| vikram@the10xagency.in | Manager (marketing team) | Team tasks, team workload, reports, read-only deals |
| neha@the10xagency.in | Manager (development team) | Projects and tasks of the dev team |
| karan@the10xagency.in | Employee | Own tasks only, "My Profile" instead of Members |
| farhan@the10xagency.in | Employee with a temporary password | The "set your own password" screen |
| manish@the10xagency.in | Inactive | Shows that inactive accounts cannot sign in |

**Start again with fresh data:** open the browser console and run `resetDemoData()`.

**Forgot password:**
- For an Employee, the request appears for the Admins on the Password Resets page, as a pop-up and as a red banner.
- For an Admin, the "emailed" reset link is printed in the browser console.

## Folder structure

```
src/
  main.jsx              start point: the router
  App.jsx               sign-in screens before login, the CRM layout after
  routes/               router.jsx (every route), navigation.js (menu, page rules, goView / focusOn / navBack), pages.jsx
  layouts/Shell.jsx     sidebar, top bar, search, notification panel, pop-ups
  pages/                one file per area: Dashboard, Tasks, TaskDetail, Projects, People, Notifications, Admin, Auth, NotFound
  components/           shared UI (Modal, Field, Icon, ui.jsx) and the forms in components/forms/
  hooks/                useServer (load with loading / error state), useHead (page title), useDirty (unsaved-changes guard)
  store/appStore.js     app state (useSyncExternalStore) and toasts
  services/
    api.js              the ONLY data layer the screens use (API.saveTask, API.load, ...)
    mockApi.js          the mock backend: one request(action, payload) function
    mock/               the mock actions by area: auth, workspace, tasks, projects, people, admin, shared
    rules.js            who may see and change what (same rules as the PHP backend)
    mockDb.js           the demo database in localStorage
    sync.js, push.js    background refresh, notification pop-ups, device notifications
  data/                 all dummy data: users, projects, tasks, deals, settings, seed.js (builds the database)
  utils/                formatting, validation, permissions for buttons, sample file generator
  styles/app.css        the CRM's original stylesheet, unchanged
public/                 logo and icons, manifest.json, sw.js (service worker for notifications)
```

**Routes** are hash URLs, so they work on any static host without server rewrites:
- `#/dashboard`, `#/mytasks`, `#/projects` and so on, one per menu item
- `#/task/TK-104`, `#/project/P-01`, `#/user/7` for detail pages
- Direct links, refresh and browser Back / Forward all work.
- An unknown address shows "Page not found".
- A page your role may not open falls back to the dashboard.

## Connecting a Laravel API later

The screens never touch the dummy data directly. They call `API.*` in `src/services/api.js`, and `API.call()`
sends every request through one function: `request(action, payload)` in `src/services/mockApi.js`.

To switch to Laravel, replace that one function. For example, with one endpoint per action:

```js
// src/services/httpApi.js
export async function request(action, payload) {
  const res = await fetch(`/api/crm/${action}`, {
    method: "POST",
    credentials: "include",                                   // Laravel Sanctum session cookie
    headers: { "Content-Type": "application/json", "Accept": "application/json",
               "X-XSRF-TOKEN": decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "") },
    body: JSON.stringify(payload || {})
  });
  return res.json();   // must answer { ok: true, ... } or { ok: false, error: "message", field?: "name" }
}
```

Then change one import in `src/services/api.js` from `./mockApi.js` to `./httpApi.js`.

The answers the screens expect are written out in `src/services/mock/*.js`; each action returns exactly what the
screens read. If you prefer REST routes (`GET /tasks`, `PUT /tasks/{id}`), map them inside the `API.*` functions
in `api.js`. The screens do not change either way.

Two more places to update when a real backend exists:
- `API.download()` and `API.uploadWithProgress()` in `api.js`: use a real file endpoint and upload progress.
- `src/services/push.js`: real Web Push needs VAPID keys on the server. The comment there marks where to subscribe.

## What the demo simulates

These work in the browser instead of on a server:
- Sign-in and sessions: the signed-in person is remembered in this browser.
- Emails: the Admin reset link is printed in the console instead of emailed.
- Push notifications: shown on this device only.
- Files: uploaded files stay in this browser (about 5 MB of storage in total). A bigger upload works until the page is reloaded; after that the CRM says so and asks to upload it again. The sample files of the dummy data are generated when downloaded.

These are left out on purpose:
- The 60-minute idle sign-out and the login rate limit, which need a server.
- The server's deep image check: uploads are checked by name, type and file signature only.
