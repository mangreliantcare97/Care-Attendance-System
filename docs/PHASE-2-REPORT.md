Terminology: 'employee' in this document means 'student' since the rename.

# Phase 2 — Foundation, shell and authentication

**Branch:** `rebuild/lean-hrm`
**Scope:** move the legacy source to `/legacy`, stand up Express + Mongoose +
connect-mongo, define the models, build authentication (login / logout / me,
CSRF, rate limit, admin safety rails), the middleware layer, the vendored
AdminLTE shell, the theme (dark mode via CSS variables), the fullscreen
handler and the shared layout/partials.

Phase 1 audit and decisions: [`PHASE-1-AUDIT.md`](PHASE-1-AUDIT.md).

---

## 1. The legacy move (Q11)

The Laravel application was moved to `/legacy` — source only:

```
legacy/app  legacy/routes  legacy/resources  legacy/database  legacy/config
legacy/tests  legacy/bootstrap  legacy/storage  legacy/public
legacy/artisan  legacy/composer.*  legacy/phpunit.xml  legacy/vite.config.js
legacy/package.json  legacy/package-lock.json  legacy/.env.example
```

Dropped as agreed: `vendor/` (9 472 files that were tracked in the first
commit), `public/build/` and `node_modules/`. The git history is untouched —
`master` still points at the original `6c9e752`.

**Secrets check (before the move):** every commit in the repository was
scanned for `.env`, key, credential and certificate files. The only match was
`.env.example`, a placeholder template — no real secret was ever committed.
The live `.env` of the new app is ignored by git and is not part of the
repository.

---

## 2. The amendments, and how they landed

| # | Amendment | Implementation |
|---|---|---|
| 1 | Dates as `YYYY-MM-DD`, `APP_TIMEZONE`, unique index | `src/utils/dates.ts` does every calendar-day calculation on plain strings; `today()` and the month bounds are derived in `APP_TIMEZONE` (default `Europe/London`). `attendance` has the unique index `{employeeId: 1, date: 1}`. Timestamps (`createdAt`, `lastLoginAt`, `decidedAt`) stay real dates. |
| 2 | Top employees score | `present*3 − late*1 − absent*2`, `on_leave`/`vacation` excluded, ties broken by fewer absences — implemented in the dashboard service (Phase 3). |
| 3 | Leave sync rules | Only approved leaves sync; non-working days are skipped (`WORKING_WEEK`); `source: 'manual'` rows are never touched; editing a `leave_sync` row flips it to `manual`; overlapping approved leaves are blocked; a pending/rejected/deleted leave removes only its own `leave_sync` rows. Implemented in `src/services/leaveSync.ts` (Phase 3). |
| 4 | Photo out of list queries | `photo` is a base64 sub-document on the employee. Every list query uses the `-photo` projection (`WITHOUT_PHOTO`), aggregations project it away, and the image is served by `GET /api/employees/:id/photo` with cache headers. **Verified** in Phase 2 against MongoDB. |
| 5 | `events` for HR dates only | The `events` model has the enum `holiday \| deadline \| meeting \| event` — leave and vacation were removed. The calendar endpoint merges approved leaves in at query time (Phase 3). |
| 6 | Dashboard counts | The dashboard counts explicit attendance records only and reports "Not marked yet" as its own figure (Phase 3). |
| 7 | Multi page static HTML | One file per module in `public/*.html`. `public/js/layout.js` injects `public/partials/sidebar.html` and `navbar.html`. The server checks the session before serving a page and redirects to `/login.html`. |
| 8 | Proxy, CSP, font, email index, seed password | `app.set('trust proxy', 1)`; helmet CSP with `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`; Source Sans Pro is self-hosted in `public/assets/fonts/` (10 woff2 files, latin + latin-ext); the employee email index is unique **and** partial (`{email: {$type: 'string'}}`) so `null` emails never collide; the seed password comes from `SEED_ADMIN_PASSWORD` and the seed refuses to run without it. |
| 9 | Employees default to deactivated | `status` defaults to `inactive`; a hard delete is blocked when attendance records exist (Phase 3). |
| 10 | Print stylesheet | `@media print` rules in `public/css/theme.css`: the chrome is hidden, tables and cards are printed cleanly, `.print-only` is revealed. |

### Notes on two details

* **Sparse vs. partial unique index.** A *sparse* index still indexes an
  explicit `null`, so the second employee without an email would fail with a
  duplicate key error. The employee email index is therefore **unique with a
  partial filter** on `{$type: 'string"}` — only real addresses are indexed.
  Empty addresses are stored as `null` by a schema setter. Verified: three
  employees without an email are fine, the same address twice is rejected with
  error 11000.
* **Event dates.** The amendment lists attendance, overtime and leave. Events
  use `YYYY-MM-DD` strings as well, because the calendar has to merge both
  sources without a type conversion — the output of the calendar endpoint is
  what FullCalendar consumes.

---

## 3. What was built

### Runtime

| File | Purpose |
|---|---|
| `server.ts` | Entry point: connect to MongoDB, start the HTTP server, graceful shutdown |
| `src/app.ts` | The express app: helmet + CSP, body parsers, session, API router, protected pages, static assets, error handling |
| `src/config/env.ts` | Typed environment, validated once at start-up |
| `src/config/db.ts` | The shared mongoose connection |
| `src/config/session.ts` | connect-mongo store, cookie options, `destroySessionsForAdmin()` |
| `src/config/pages.ts` | The allowlist of static pages |
| `src/models/*` | Admin, Employee, Department, Attendance, Overtime, Leave, Event |
| `src/middleware/*` | `requireAuth`, `requireAdmin`, `requireAuthPage`, `requireCsrf`, rate limiter, 404 + error handler |
| `src/routes/*` | `/api/health`, `/api/auth/*`, `/api/admins/*` |
| `src/services/admins.ts` | Administrator management **and the safety rails** |
| `src/utils/*` | Date helpers, zod validation, response envelope |
| `seed/seed.ts` | Creates the first administrator from the environment |
| `tests/*` | 30 tests across two suites |

### Front end

| File | Purpose |
|---|---|
| `public/login.html` + `public/js/login.js` | Sign in, with the blurred photo background of the original |
| `public/dashboard.html` … `public/admins.html` | One file per module |
| `public/admins.html` + `public/js/admins.js` | The administrator list — the only page with live data in Phase 2 |
| `public/partials/sidebar.html`, `navbar.html` | The shared navigation |
| `public/js/layout.js` | Injects the partials, loads AdminLTE *after* the DOM is complete, checks the session, wires the logout |
| `public/js/theme.js` | Dark mode: `localStorage` → `prefers-color-scheme` → `data-theme` on `<html>`, applied before the first paint |
| `public/css/theme.css` | Design tokens, dark palette, `.card-glass`, badges, empty states, print stylesheet |
| `public/js/fullscreen.js` | Fullscreen API with icon swap and `fullscreenchange` handling |
| `public/js/api.js` | The fetch wrapper (envelope, CSRF header, 401 handling) |
| `public/js/toast.js` | Toastr wrapper with a plain `alert()` fallback |
| `public/vendor/*` | AdminLTE 3.2, Bootstrap 4 bundle, jQuery 3.6, Font Awesome 5, Toastr, Chart.js 2.9.4, FullCalendar 5.10.1 — **2.9 MB** instead of the 64 MB of the old `plugins/` folder |
| `public/assets/fonts/*` | Self-hosted Source Sans Pro (latin + latin-ext, 181 KB) |

### Authentication & safety rails

* `POST /api/auth/login` — rate limited per IP, the session id is regenerated
  on every login (session fixation), the answer is identical for an unknown
  email and a wrong password, and a dummy hash keeps the timing even.
* `GET /api/auth/me` — returns the admin and a CSRF token.
* `POST /api/auth/logout` — destroys the session and clears the cookie.
* CSRF — double submit token, compared in constant time. `POST /api/auth/login`
  is exempt (no session yet); `POST /api/auth/logout` needs the token only
  while a session is still alive.
* Rate limit — `express-rate-limit`, `draft-7` headers, a JSON answer.
* **Safety rails (Q13)**
  * an admin cannot deactivate their own account → `cannot_deactivate_self`
  * the last active administrator cannot be deactivated →
    `cannot_deactivate_last_admin`
  * deactivating an admin deletes their sessions from the store, so they lose
    access immediately (not when their cookie expires)
  * `isActive` is re-checked on every request, so a deactivation takes effect
    at once even for a session that is still open
  * a `viewer` may read but not write

---

## 4. Verification

```
npm run typecheck   →  no errors
npm test            →  30 tests, 30 passed
```

The suite covers the login flow (success, wrong password, unknown email,
invalid payload, deactivated account), `/api/auth/me`, logout (with token,
without token, without a session), the CSRF protection, the login rate limit
(in its own file, because the test runner gives every file its own process
and therefore its own database) and every safety rail. The page guard
(redirect vs. serve) and the security headers are covered as well.

The app was also run locally against a real MongoDB:

| Check | Result |
|---|---|
| `GET /api/health` | `200 {"status":"ok"}` |
| `GET /dashboard.html` without a session | `302 → /login.html?next=%2Fdashboard.html` |
| `POST /api/auth/login` (wrong password) | `401 invalid_credentials` |
| `POST /api/auth/login` (correct password) | `200` + admin + CSRF token + session cookie |
| `GET /api/auth/me` with the cookie | `200` + admin + CSRF token |
| `GET /dashboard.html` with the cookie | `200` |
| `POST /api/admins/:ownId/deactivate` | `400 cannot_deactivate_self` |
| `POST /api/admins/:otherId/deactivate` | `200`, `revokedSessions` reported |
| Sign in as the deactivated admin | `403 account_disabled` |
| `POST /api/admins` without a CSRF header | `403 csrf_token_mismatch` |
| `POST /api/auth/logout` | `200`, the session is gone afterwards |
| Malformed JSON body | `400 invalid_json` |
| All CSS, JS, fonts, images, partials | `200` |

Two bugs were found and fixed while testing:

* a malformed JSON body was answered with `500` instead of `400` — the error
  handler now understands the body parser errors;
* `logout` was rejected by the CSRF check before the session had been
  invalidated — it now needs the token only while a session is alive.

---

## 5. Open items for Phase 3

* Employees, departments, attendance, overtime, leave & vacation, calendar and
  the reports — the pages exist, their APIs do not.
* `GET /api/employees/:id/photo` (cache headers, ETag).
* The leave → attendance sync service and the overlap rule.
* The dashboard statistics, including the "Not marked yet" figure and the top
  employees ranking.
* The calendar endpoint that merges the approved leaves into the events.
* CSV export for the reports (the print stylesheet is already in place).
