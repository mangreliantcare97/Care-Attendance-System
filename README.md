# Care Attendance

Care Attendance is a public check-in / check-out page plus a login-protected
admin panel, built with Express, TypeScript and MongoDB. The admin UI keeps the
AdminLTE 3.2 / Bootstrap 4 shell, fully vendored. The public form is
cookie-free and does not require an account.

This branch (`care-attendance-system`) is being converted from the earlier HRM
application. Phase 1 removed the HRM modules (employees, attendance, leave,
overtime, reports, calendar and departments) and the reference copy of the old
Laravel tree. Phase 2 step A rebuilt the locations CRUD, the public form and
the public API. Phase 2 steps B and C deliver the Entries administration page
and dashboard metrics.

---

## Requirements

| Tool | Version |
|---|---|
| Node.js | 22.18 or newer (native TypeScript execution, no build step) |
| MongoDB | 6.0 or newer (local) / Atlas (hosted) |

## Getting started

```bash
npm install
cp .env.example .env          # set a new SESSION_SECRET and MONGODB_URI
npm run seed                  # creates the first admin from the environment
npm run seed:locations        # loads the 18 standard locations
npm start                     # http://localhost:3000
npm run doctor                # check database, admins, locations and entries
```

`SESSION_SECRET` is required in every environment. Generate a new value for
this project and never reuse the old HRM secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The default database is `mongodb://127.0.0.1:27017/care-attendance`. Do not
point Care Attendance at the old HRM database.

`npm run seed` **never** uses a hardcoded password: it reads
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from the environment and refuses
to run when they are missing.

### Who uses which link

| Link | Audience | What happens |
|---|---|---|
| `/`, `/checkin`, `/checkin.html` | Staff, on any shared or personal device | The same public check-in page. No login, no session cookie, no admin navigation, and `noindex`. An optional `?location=<id>` preselects an **active** location; unknown and inactive ids are ignored. |
| `/admin` | Administrators | A signed-in administrator is sent to `/dashboard.html`; everyone else is sent to `/login.html?next=/dashboard.html`. |
| `/login.html` | Administrators | Signs in and then follows a validated local `next` path, or the dashboard. A signed-in administrator is sent straight to `/dashboard.html`. |
| `/dashboard.html`, `/entries.html`, `/locations.html`, and the other module pages | Administrators | Protected HTML pages. Signed-out requests are sent to `/login.html?next=<path and query>`. |
| `/api/public/locations`, `/api/public/entries` | The public form | Cookie-free JSON endpoints. Only active locations are exposed, and only their id and name. |
| `/api/*` (everything else) | Administrators | A signed-out request always gets JSON `401 { "success": false, "error": { "code": "unauthenticated", … } }`, never an HTML page or application data. |

The public link is intentionally stable and safe to print. Links are built from
`APP_BASE_URL`, never from the current browser origin or the request `Host`
header, so a proxy or preview host cannot poison a printed QR code.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Public form (/): pressing Submit shows no confirmation | Check the browser Network panel for the POST to `/api/public/entries`. A successful submission opens a confirmation dialog; the form resets only after that dialog closes. |
| Admin Locations page stuck on "Loading locations..." | A successful list response is rendered after loading completes. A request that does not respond is aborted after 15 seconds and shows an error with Retry. `npm run test:e2e` exercises both paths. Run `npm run doctor` to inspect MongoDB and record counts. |

### Shared-device warning

The public check-in page is designed for a shared kiosk or staff tablet. If an
administrator signs in on that device, the next person can use the admin panel
until the session is ended. Use the **Log out** action when finished and never
save the administrator password in the kiosk browser. Sessions are rolling and
expire after `SESSION_MAX_HOURS` of inactivity (12 hours by default); the
cookie is `httpOnly`, `SameSite=Lax`, and `Secure` when
`NODE_ENV=production`.

### Where each page stands

| Page | State |
|---|---|
| `/` (`checkin.html`) | **Real.** The six-field public form, cookie-free, `noindex`, with inline validation, the `Now` button in `APP_TIMEZONE`, the two location messages and the reset for the next person. |
| `/locations.html` | **Real.** Search, sorting, “Sort A-Z”, the add/edit modal, entry counts, deactivate-instead-of-delete and “Copy check-in link”. |
| `/dashboard.html` | **Real.** Timezone-aware counts for today, active locations, a seven-day entries chart, a user-type chart and recent entries, alongside the public link and no-active-locations warning. |
| `/entries.html` | **Real.** Server-filtered, sortable and paginated entries with edit, audited soft-delete and filtered CSV export. |

Every protected page sits behind the administrator login. Module data is
loaded from authenticated APIs after the shared session check in
`public/js/layout.js`.

### The public form

Everything on the form is required and nothing is preselected — the person has
to choose every value:

1. **User Type** — Staff Member, Service User or Visitor.
2. **Name** — 2–80 characters, `autocomplete="off"`, no suggestions.
3. **Check in or Check out** — a select, not radio buttons.
4. **Time** — Hour / Minute / AM-PM selects plus a **Now** button that fills
   the current time in `APP_TIMEZONE` (delivered by `meta.timezone` on the
   locations feed, never the kiosk's own clock). The chosen time is echoed
   underneath as `Time: 09:05 AM` so a wrong AM/PM is visible. The picker is
   never prefilled.
5. **Location** — from `GET /api/public/locations`; `?location=<id>`
   preselects an active location and ignores anything else. The full address
   is repeated under the select so long labels wrap on a 360px screen.
6. **Notes** — 1–500 characters with a live counter.

Validation happens in the browser first (inline messages, focus to the first
error, `aria-invalid` and `aria-describedby`) and again on the server. On
success the page says `Thank you, <name>. Your <check in|check out> at
<hh:mm AM/PM> has been recorded.` and resets itself for the next person; it
never shows an existing entry.

**The date rule.** The server decides the calendar day in `APP_TIMEZONE`. An
earlier time today is fine. A time more than five minutes ahead is accepted as
*yesterday* only when the server clock is before 03:00 and that moment is no
more than six hours back — which is what makes "11:50 PM" submitted at 00:10
belong to the previous day. Everything else is refused with
`400 time_in_future` (“That time is later than now. Please check AM/PM.”).

**Abuse protection.** One generous per-IP budget covers both public endpoints
(`PUBLIC_RATE_LIMIT_MAX` per 15 minutes), the hidden honeypot field is
accepted and discarded without a trace, the same person, direction and
location inside two minutes is refused as a duplicate, the JSON body is
limited to 8kB, cross-site browser requests are refused when a foreign
`Origin` header is present, and Cloudflare Turnstile is enforced only when
`TURNSTILE_SECRET` is set. Names are never logged together with locations.

### Locations

`npm run seed:locations` inserts the 18 real sites from `seed/locations.json`:

* It needs an existing active administrator (run `npm run seed` first), because
  every row records `createdBy`. Without one it stops and says so.
* It is idempotent and insert-only. The key is the normalised name plus the
  postcode, and `$setOnInsert` means a location an administrator has edited or
  deactivated is never overwritten. Entries are never touched.
* `sortOrder` is the position in the file, every row is active, and the address
  text is kept exactly as supplied — including “Saftesbury”, “Ecronwald” and
  “Sailsbury”.
* Postcodes are normalised to uppercase with one space before the final three
  characters and checked leniently. A postcode that fails is printed in the run
  summary but the row is still inserted; no address text is corrected.
* It prints the database name (never credentials) and the counts:

```
[seed:locations] database: care-attendance-demo
[seed:locations] administrator: demo-admin@example.com
[seed:locations] inserted 18, already existed 0 (18 in seed/locations.json, 18 in this database).
```

Running it a second time prints `inserted 0, already existed 18`.

A postcode may hold more than one label: 33 and 35 Chandos Road share
`HA1 4QX`, and 178 and 180 Church Road share `UB3 2LS`. The unique rule is the
pair (name, postcode), never the postcode alone.

The public form loads `GET /api/public/locations`, which returns only
`{ id, name }` for active locations ordered by `sortOrder` and then name. The
postcode and entry counts stay behind the authenticated admin API.

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start the server with file watching |
| `npm test` | Run the full test suite |
| `npm run test:e2e` | Start the app against an isolated `mongodb-memory-server`, seed an admin + 18 locations, and run browser checks |
| `npm run doctor` | Show DB name, MongoDB reachability, admins, locations (active/total), entries and next steps |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Create/update the administrator from the environment |
| `npm run seed:locations` | Insert the 18 locations from `seed/locations.json` (idempotent) |
| `npm run reset-admin-password -- <email>` | Emergency password recovery (see below) |

`npm run test:e2e` does not use a local MongoDB server or the database configured
in `.env`. It requires Chrome; set `CHROME_BIN` if Chrome is not at the standard
Windows installation path. It writes the browser evidence to `.verify/`,
including empty/invalid/filled forms, success and error dialogs, the duplicate
message and the Locations table.

## Configuration

Everything is read from the environment (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `APP_TIMEZONE` | `Europe/London` | Timezone used to decide the date of an entry |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/care-attendance` | Database connection |
| `SESSION_SECRET` | — | **Required in every environment**; use a new long random value |
| `SESSION_COOKIE_NAME` | `care.sid` | Name of the session cookie |
| `SESSION_MAX_HOURS` | `12` | Rolling session lifetime in hours; every request refreshes it |
| `TRUST_PROXY` | `1` | Number of reverse proxies in front of the app |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Login attempts per window and IP |
| `PUBLIC_RATE_LIMIT_WINDOW_MINUTES` | `15` | Window for both public endpoints |
| `PUBLIC_RATE_LIMIT_MAX` | `100` | Public requests per window and IP (offices share one address) |
| `TURNSTILE_SECRET` | — | Optional Cloudflare Turnstile on the public form; empty = the check is off |
| `MAIL_PROVIDER` | `none` | `none`, `console`, `cloudflare` or `brevo` |
| `MAIL_FROM` | — | The sender, e.g. `Care Attendance <noreply@example.com>` |
| `CLOUDFLARE_ACCOUNT_ID` | — | Cloudflare account id (email sending) |
| `CLOUDFLARE_EMAIL_API_TOKEN` | — | Cloudflare API token with email sending permission |
| `BREVO_API_KEY` | — | Brevo API key; only needed with `MAIL_PROVIDER=brevo` |
| `APP_BASE_URL` | `APP_URL` | The public address used for reset links and printed check-in links |
| `PASSWORD_RESET_TTL_MINUTES` | `30` | How long a reset link is valid |
| `PASSWORD_RESET_RATE_LIMIT_MAX` | `5` | Reset requests per window, per IP and per address |

### Render deployment

Use a new Render Web Service named `care-attendance` and a new MongoDB Atlas
database named `care-attendance`; never reuse the old HRM service or database.
The service starts with `npm install` and `npm start`, and the health check is
`GET /api/health`. Set at least:

```
NODE_ENV=production
MONGODB_URI=<new Atlas care-attendance connection string>
SESSION_SECRET=<new long random value>
SESSION_MAX_HOURS=12
APP_URL=https://care-attendance.onrender.com
APP_BASE_URL=https://care-attendance.onrender.com
TRUST_PROXY=1
```

There is no `render.yaml` in this repository, so the service name is configured
in the Render dashboard. Free services sleep after inactivity; Atlas M0 has no
backups.

### Netlify frontend with Render API

`netlify.toml` publishes the `public/` directory, serves `checkin.html` at `/`,
and proxies `/api/*` to the Render service at
`https://care-attendance-system.onrender.com`. If the Render service URL
changes, update the API rewrite target and redeploy Netlify.

Set Render's `APP_URL` and `APP_BASE_URL` to
`https://care-attendance-system.netlify.app`. The browser then uses one
same-origin Netlify URL for pages and API requests, while Netlify proxies API
traffic to Render. Keep `APP_BASE_URL` aligned with the actual public frontend
URL; it controls public check-in links, origin validation, and password-reset
links.

## Installable app (PWA)

The site uses a web manifest and one root-scoped service worker; it remains the
same multi-page Express/HTML application. The Home Screen icon opens `/`, the
existing public check-in page. Protected admin pages still require the existing
server session and send signed-out users through the usual login redirect.

The supplied `public/assets/img/Attendance_APP_Icon.png` (1024 × 1024) is the
source for the standard 192 × 192 and 512 × 512 icons, padded maskable
variants, the 180 × 180 Apple touch icon, and a 48 × 48 favicon. Derived PNGs
are in `public/assets/img/pwa/`; the source image is unchanged.

The service worker caches only same-origin static CSS, JavaScript, fonts and
images after a successful network response. It never caches HTML, API
responses, session data or writes. Navigation stays network-only; on a network
failure it displays a generic offline page and does not claim that a check-in
or administrative change succeeded. The offline page is cached at installation.
When a new worker is ready, an **Update app** button waits for the user's choice
before activating it and reloading the current page. Old caches are limited to
the `care-attendance-pwa-` namespace.

Production installation requires HTTPS (localhost is a secure development
context). The deployment is rooted at `/`, matching the application's existing
absolute routes; hosting it below a URL subdirectory is not supported.
`service-worker.js` and the manifest are served with revalidation headers by
Express, and `netlify.toml` sets the equivalent Netlify headers.

### Install on Android

1. Open the production site in Chrome.
2. When Chrome reports the app is installable, tap **Install app** on the page
   or choose Chrome's **Install app** / **Add to Home screen** menu item.
3. Confirm the installation. Open **Care Attendance** from the Home Screen.

The in-page button appears only after the browser provides its native install
prompt. If it is unavailable, use Chrome's menu when that option is offered.

### Add on iPhone or iPad

1. Open the production site in **Safari**.
2. Tap **Share**, choose **Add to Home Screen**, then tap **Add**. If Safari
   offers **Open as Web App**, leave it enabled.
3. Launch **Care Attendance** from the Home Screen. Sign in as usual to use
   protected admin pages.

Safari does not provide the Android `beforeinstallprompt` event; the page's
**Install app** button opens these manual instructions instead. In other iOS
browsers, the instructions direct you to open the site in Safari.
On iOS, an installed app can be identified while it is running standalone, but
Safari provides no reliable API for detecting its installation from an ordinary
browser tab; dismissing the guide suppresses it in that browser for 30 days.

## Password reset email providers

The app supports Cloudflare Email Service and Brevo transactional email through
their REST APIs; it does not use SMTP. Choose one provider and configure its
credentials as server environment variables. `MAIL_FROM` must be a sender
registered with that provider.

### Brevo (includes a free plan)

Brevo's Free plan currently includes transactional email with a daily sending
limit. Check [Brevo's current plan details](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans).

1. Create a Brevo account and add a sender under **Settings → Senders, Domains, IPs → Senders**.
2. Verify the sender address using the confirmation code Brevo sends to it.
   A free mailbox address can be used if you can receive its verification
   message, but authenticating your own domain is recommended for delivery and
   sender reputation.
3. Create a Brevo API key in your account settings. Keep it private.
4. Add these values to the app host's environment settings:

   ```
   MAIL_PROVIDER=brevo
   MAIL_FROM="Care Attendance <verified-sender@example.com>"
   BREVO_API_KEY=<your Brevo API key>
   APP_BASE_URL=https://your-public-app-url
   ```

Brevo API docs: [Send a transactional email](https://developers.brevo.com/docs/send-a-transactional-email).

### Cloudflare Email Service

1. Add your domain to Cloudflare and point the nameservers at it.
2. In **Compute → Email Service → Email Sending**, onboard and verify the
   sending domain.
3. Create an API token with **Email Sending → Edit** permission.
4. Verify admin recipient addresses as required by Cloudflare Email Routing.
5. Add these values to the app host's environment settings:

   ```
   MAIL_PROVIDER=cloudflare
   MAIL_FROM="Care Attendance <noreply@yourdomain.com>"
   CLOUDFLARE_ACCOUNT_ID=<your account id>
   CLOUDFLARE_EMAIL_API_TOKEN=<your API token>
   APP_BASE_URL=https://your-public-app-url
   ```

### Test and troubleshoot

Use the login page's **Forgot password?** flow with an admin inbox you can
access. For local development, `MAIL_PROVIDER=console` prints the message,
including the reset link, to the server log. In production, mail delivery
failures are logged by the server; provider dashboards show delivery status.

`APP_BASE_URL` is the only source for reset links—the request headers are never
used, so a forged `Host` header cannot send an administrator to a hostile site.

### If an administrator is locked out

```bash
RESET_ADMIN_PASSWORD='a-new-password' npm run reset-admin-password -- admin@example.com
```

The new password is read from the environment — never from the command line
(where it would end up in the shell history) and never from the repository.
Every session of that administrator is signed out afterwards.

## Project layout

```
server.ts              entry point — connects to MongoDB and starts the HTTP server
src/
  app.ts               the express application (middleware, routes, static files)
  config/              env, database, session store, page list, post-login redirect allowlist
  models/              mongoose models (Admin, PasswordReset, Location, Entry)
  middleware/          requireAuth, requireAdmin, requireAuthPage, CSRF, rate limit, errors
  routes/              API routers
  controllers/         request handlers
  services/            business rules (admins and safety rails, locations, entries, mailer)
  utils/               dates, validation, responses, pagination, CSV, escaping
public/
  *.html               one file per page (multi page, not an SPA)
  checkin.html         public, cookie-free check-in page (also served at / and /checkin)
  partials/            sidebar + navbar, injected by layout.js
  css/theme.css        design tokens, dark mode, print stylesheet
  css/checkin.css      standalone styles for the public page
  js/                  theme, layout, api client, fullscreen, toast, DOM helpers
  vendor/              AdminLTE, Bootstrap, jQuery, Font Awesome, Chart.js, Toastr
  assets/fonts/        self-hosted Source Sans Pro
seed/seed.ts           creates the first administrator
seed/seed-locations.ts inserts the 18 locations (idempotent, needs an admin)
seed/locations.json    the real address labels and postcodes
seed/reset-admin-password.ts   emergency password recovery
tests/                 node:test suites (in-memory MongoDB)
```

## How the app is put together

* **Multi page, not an SPA.** Every page is its own HTML file. The sidebar and
  the navbar live in `public/partials/` and are injected by
  `public/js/layout.js`, so the navigation is defined exactly once.
* **The pages are protected.** The server checks the session before it serves
  a page and redirects anonymous visitors to `/login.html?next=<path and query>`.
  Only the protected page allowlist can be used as a post-login `next` target.
* **Sessions** live in MongoDB (`connect-mongo`) and are rolling. The cookie is
  httpOnly, `SameSite=Lax` and `Secure` in production, and expires after
  `SESSION_MAX_HOURS` of inactivity. `trust proxy` is set to 1.
* **CSRF** uses a double submit token: it is issued at login, handed out by
  `GET /api/auth/me` and has to be echoed in the `X-CSRF-Token` header.
* **Login** is rate limited per IP and never reveals whether an email exists.
* **Deactivating an admin** revokes their sessions immediately — the admin
  record is re-checked on every request.
* **Content Security Policy** is strict: everything (including the webfont) is
  served from our own origin, so no third party is ever contacted. Scripts are
  same origin only — there is not a single inline script or event handler in
  the app. Inline *styles* are allowed, because AdminLTE, Bootstrap (modals)
  and Chart.js set element styles from JavaScript.
* **User data is never put into the page as markup.** The client builds its
  tables with a tagged template (`HrmDom.html`) that escapes every value.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe |
| `POST` | `/api/auth/login` | Sign in (rate limited, no CSRF token needed) |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | The signed-in admin + a CSRF token |
| `POST` | `/api/auth/forgot-password` | Ask for a reset link (always the same answer) |
| `POST` | `/api/auth/reset-password` | Set a new password with a reset token |
| `GET` | `/api/admins` | List administrators — filters, whitelisted sort, pagination |
| `POST` | `/api/admins` | Create an administrator |
| `GET` | `/api/admins/:id` | One administrator (used by the edit form) |
| `PATCH` | `/api/admins/:id` | Update name, email, status or another admin's password |
| `DELETE` | `/api/admins/:id` | Delete an administrator (guarded by the safety rails) |
| `POST` | `/api/admins/bulk` | Disable or delete several administrators atomically |
| `POST` | `/api/admins/:id/activate` | Activate an administrator (kept for compatibility) |
| `POST` | `/api/admins/:id/deactivate` | Deactivate an administrator (kept for compatibility) |
| `POST` | `/api/admins/me/password` | Change your own password |
| `GET` | `/api/public/locations` | Active locations for the public form (`id` and `name` only, in sort order; `meta.timezone` carries `APP_TIMEZONE` for the `Now` button) |
| `POST` | `/api/public/entries` | Record one public check-in or check-out (no session, no cookies) |
| `GET` | `/api/entries` | Filtered, sorted and paginated entries for the admin panel |
| `GET` | `/api/entries/:id` | One non-deleted entry |
| `PATCH` | `/api/entries/:id` | Correct an entry; records the acting administrator |
| `DELETE` | `/api/entries/:id` | Soft-delete an entry and retain its audit history |
| `GET` | `/api/entries/export.csv` | CSV export using the entry list filters |
| `GET` | `/api/dashboard` | Timezone-aware dashboard metrics, chart series and recent entries |
| `GET` | `/api/locations` | Locations with postcode, sort order and entry counts |
| `POST` | `/api/locations` | Create a location (unique on name + postcode) |
| `PATCH` | `/api/locations/:id` | Rename, retype the postcode, reorder or deactivate a location |
| `DELETE` | `/api/locations/:id` | Delete a location that has no entries (otherwise deactivate it) |

Responses always use the same envelope:

```json
{ "success": true,  "data": {}, "meta": {} }
{ "success": false, "error": { "code": "", "message": "" } }
```

The Entries list accepts `search`, `userType`, `direction`, `locationId`,
`dateFrom`, `dateTo`, `sort`, `order`, `page` and `perPage`. Sort fields are
whitelisted; dates use `YYYY-MM-DD`; per-page size is capped at 100. CSV export
uses the same filters and sort, exports every matching row (not only the
current page), and escapes spreadsheet formula prefixes. Deletion is a
soft-delete; deleted records are excluded from lists, exports, location counts
and dashboard metrics. Corrections retain the original server receipt time and
record the administrator in `updatedBy`.

### Administrator management

The list at `/admins.html` is server-driven. `GET /api/admins` accepts `name`,
`email`, `status` (`enabled` or `disabled`), `sort` (`name`, `email`, `status`
or `lastLogin`), `order` (`asc` or `desc`), `page` and `perPage` (default 20,
maximum 100). Any other sort column is rejected with `422 validation_error`.
Listing and single-record responses never include the password hash.

`POST /api/admins` requires `name`, `email`, `password` and `confirmPassword`.
The email is trimmed and lowercased; uniqueness is case-insensitive; the only
accepted role is `admin` and it is forced on create and update. `PATCH
/api/admins/:id` can change the name, email, status or — for **another**
administrator — a new password plus `confirmPassword`. Changing another
administrator's password revokes all of their sessions and sends them a notice.
Disabling an administrator also revokes their sessions immediately. Use
`/my-account.html` (backed by `POST /api/admins/me/password`) to change your own
password; the admin PATCH endpoint refuses that with `400
cannot_change_own_password`.

Deletion is deliberately guarded:

* An administrator cannot delete themselves — `409 cannot_delete_self`.
* The last active administrator cannot be deleted — `409 last_active_admin`.
* Disable the account instead of deleting it when the audit trail matters.

The author-reference guard (“an admin recorded as `createdBy` / `updatedBy` /
`deletedBy` cannot be deleted”) returns in Phase 2, when locations and entries
start recording the acting administrator. The Phase 1 clean-up deliberately
removed the HRM collections that guard used to query.

`POST /api/admins/bulk` accepts `{ "action": "disable" | "delete", "ids": [...] }`.
Every target is checked before the first write, so the operation is
all-or-nothing: it can never remove the signed-in admin or leave zero active
administrators. A refusal returns `409 bulk_rejected` with a `details` array
containing one `{ id, code, message }` per offending id. The single-admin
disable rails remain `400 cannot_deactivate_self` and `400
cannot_deactivate_last_admin` for compatibility with the activate/deactivate
endpoints.

## Status

* **Phase 1** — complete and approved: HRM modules and the reference `legacy/`
  tree removed, sidebar reduced to Dashboard, Entries, Locations and Admins &
  Settings, sessions/CSRF/helmet/rate limiting/zod/CSV/HrmDom kept, password
  reset via the Cloudflare mailer kept.
* **Phase 2, step A** — complete: the real Locations page, the idempotent
  `seed:locations` run, the six-field public form, the public entries API with
  its abuse protections, the routing/redirect rules, the dashboard link and
  warning cards, and the test suite (in-memory MongoDB) plus a headless Chrome
  pass over the public page.
* **Phase 2, step B** — complete: the filterable, sortable, paginated Entries
  page, audited corrections and soft-delete, and formula-safe filtered CSV.
* **Phase 2, step C** — complete: timezone-aware dashboard cards, seven-day
  and user-type charts, recent entries and the active-location warning.
* The earlier HRM reports in `docs/` were removed with the code they described;
