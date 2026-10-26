# Care Attendance

Care Attendance is a public check-in / check-out page plus a login-protected
admin panel, built with Express, TypeScript and MongoDB. The admin UI keeps the
AdminLTE 3.2 / Bootstrap 4 shell, fully vendored. The public form is
cookie-free and does not require an account.

This branch (`care-attendance-system`) is being converted from the earlier HRM
application. Phase 1 removed the HRM modules (employees, attendance, leave,
overtime, reports, calendar and departments) and the reference copy of the old
Laravel tree. The Dashboard, Entries and Locations admin pages are Phase 1
placeholders until Phase 2 builds them.

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
npm start                     # http://localhost:3000
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

### Shared-device warning

The public check-in page is designed for a shared kiosk or staff tablet. If an
administrator signs in on that device, the next person can use the admin panel
until the session is ended. Use the **Log out** action when finished and never
save the administrator password in the kiosk browser. Sessions are rolling and
expire after `SESSION_MAX_HOURS` of inactivity (12 hours by default); the
cookie is `httpOnly`, `SameSite=Lax`, and `Secure` when
`NODE_ENV=production`.

### Phase 1 placeholders

Three protected pages are deliberately empty shells in Phase 1:

| Page | Phase 1 state |
|---|---|
| `/dashboard.html` | Heading plus “Coming in Phase 2” |
| `/entries.html` | Heading plus “Coming in Phase 2” |
| `/locations.html` | Heading plus “Coming in Phase 2” |

They sit behind the administrator login like every other protected page, show
no data, and call no endpoint except the shared session check in
`public/js/layout.js`. The sidebar links to all three; Phase 2 replaces each
file with the real dashboard, entries table and locations CRUD. The public
check-in page is not a placeholder.

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start the server with file watching |
| `npm test` | Run the test suite (in-memory MongoDB) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Create/update the administrator from the environment |
| `npm run reset-admin-password -- <email>` | Emergency password recovery (see below) |

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
| `MAIL_PROVIDER` | `none` | `none`, `console` or `cloudflare` |
| `MAIL_FROM` | — | The sender, e.g. `Care Attendance <noreply@example.com>` |
| `CLOUDFLARE_ACCOUNT_ID` | — | Cloudflare account id (email sending) |
| `CLOUDFLARE_EMAIL_API_TOKEN` | — | Cloudflare API token with email sending permission |
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

## Password reset (Cloudflare Email Service)

The reset mail is sent through the [Cloudflare Email Service](https://developers.cloudflare.com/email-service/).
SMTP is never used.

### Setup

1. **Add your domain** to Cloudflare and point the nameservers at it.
2. **Verify the sending domain:** in the dashboard open
   *Compute → Email Service → Email Sending*, choose *Onboard Domain* and follow
   the wizard. Cloudflare creates the DKIM and SPF records for you.
3. **Create an API token:** *My Profile → API Tokens → Create Token* with the
   permission **Email Sending → Edit** (nothing else). Copy the token — it is
   only shown once.
4. **Verify the destination addresses of your administrators:** open
   *Email → Email Routing → Destination addresses* and confirm every
   administrator address. A reset mail to an unverified address is rejected.
5. **Set the environment variables** (on Render: *Environment*):

   ```
   MAIL_PROVIDER=cloudflare
   MAIL_FROM="Care Attendance <noreply@yourdomain.com>"
   CLOUDFLARE_ACCOUNT_ID=<your account id>
   CLOUDFLARE_EMAIL_API_TOKEN=<the token>
   APP_BASE_URL=https://care-attendance.onrender.com
   ```

   `APP_BASE_URL` is the only source for the reset link — the request headers
   are never used, so a forged `Host` header cannot send an administrator to a
   hostile site.

### Testing one real send

```bash
# locally: print the mail instead of sending it
MAIL_PROVIDER=console npm start
```

```bash
# for real: start the app and use the login page → "Forgot password?"
MAIL_PROVIDER=cloudflare npm start
```

With `MAIL_PROVIDER=console` the whole mail — including the reset link — is
printed to the server log. With `cloudflare` the mail is delivered to the
administrator; the API response is the same either way, so the Cloudflare
dashboard log is the place to look when a mail does not arrive.

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
| `GET` | `/api/public/locations` | Active locations for the public form (`id` and `name` only) |
| `POST` | `/api/public/entries` | Record one public check-in or check-out |
| `GET` | `/api/entries` | Newest entries for the admin panel (Phase 2 columns) |
| `GET` | `/api/locations` | Locations with entry counts (Phase 2 columns) |

Responses always use the same envelope:

```json
{ "success": true,  "data": {}, "meta": {} }
{ "success": false, "error": { "code": "", "message": "" } }
```

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

* **Phase 1** — clean-up complete: HRM modules and the reference `legacy/`
  tree removed, sidebar reduced to Dashboard, Entries, Locations and Admins &
  Settings, three placeholder pages in place, README updated.
* **Next** — Phase 2: the locations CRUD, the entries model and API, the public
  form, the admin pages, the dashboard and the tests.
* The earlier HRM reports remain in `docs/` for reference only; the features
  they describe are no longer part of this application.
