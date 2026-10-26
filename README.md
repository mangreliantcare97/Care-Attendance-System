# Lean HRM

A lean rewrite of the Laravel **Human Resource Management** system as an
Express + MongoDB application. The UI keeps the original design (AdminLTE 3.2
on Bootstrap 4, fully vendored), the backend is a small TypeScript service.

The old Laravel application is kept in [`/legacy`](legacy) for reference only —
it is not executed and not built.

---

## Requirements

| Tool | Version |
|---|---|
| Node.js | 22.18 or newer (native TypeScript execution, no build step) |
| MongoDB | 6.0 or newer (local) / Atlas (hosted) |

## Getting started

```bash
npm install
cp .env.example .env          # then fill in SESSION_SECRET and MONGODB_URI
npm run seed                  # creates the first admin from the environment
npm start                     # http://localhost:3000
```

`npm run seed` **never** uses a hardcoded password: it reads
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from the environment and refuses
to run when they are missing.

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start the server with file watching |
| `npm test` | Run the test suite (in-memory MongoDB) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Create/update the administrator from the environment |
| `npm run seed:history` | Local/test only: deterministic 2025-2026 HR history |
| `npm run seed:2025` | Alias for `seed:history` (the same two-year dataset) |
| `npm run seed:demo` | Local/demo only: departments, students and three months of data |
| `npm run seed:photos` | Attach the local portraits in `public/images/students/` to matching students |
| `npm run migrate:allowances` | Remove the retired `carryOver` field (idempotent, no other data touched) |
| `npm run migrate:students` | Rename the legacy `employees` collection and `employeeId` fields to `students` / `studentId` (idempotent; `-- --dry-run` writes nothing) |
| `npm run resync-leaves` | Recompute leave days and reconcile every leave after a `WORKING_WEEK` change |
| `npm run reset-admin-password -- <email>` | Emergency password recovery (see below) |

## Configuration

Everything is read from the environment (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `APP_TIMEZONE` | `Europe/London` | Timezone used for "today" and month boundaries |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/lean-hrm` | Database connection |
| `SESSION_SECRET` | — | **Required in production** |
| `TRUST_PROXY` | `1` | Number of reverse proxies in front of the app |
| `WORKING_WEEK` | `1,2,3,4,5` | ISO weekdays (1 = Monday) that count as working days |
| `ANNUAL_ALLOWANCE_DEFAULT` | `28` | Default holiday allowance per student and calendar year |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Login attempts per window and IP |
| `STUDENT_PHOTO_MAX_BYTES` | `262144` | Maximum accepted photo size |
| `MAIL_PROVIDER` | `none` | `none`, `console` or `cloudflare` |
| `MAIL_FROM` | — | The sender, e.g. `Human Resource <noreply@example.com>` |
| `CLOUDFLARE_ACCOUNT_ID` | — | Cloudflare account id (email sending) |
| `CLOUDFLARE_EMAIL_API_TOKEN` | — | Cloudflare API token with email sending permission |
| `APP_BASE_URL` | `APP_URL` | The public address — the reset links are built from it |
| `PASSWORD_RESET_TTL_MINUTES` | `30` | How long a reset link is valid |
| `PASSWORD_RESET_RATE_LIMIT_MAX` | `5` | Reset requests per window, per IP and per address |

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
   MAIL_FROM="Human Resource <noreply@yourdomain.com>"
   CLOUDFLARE_ACCOUNT_ID=<your account id>
   CLOUDFLARE_EMAIL_API_TOKEN=<the token>
   APP_BASE_URL=https://your-app.onrender.com
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
printed to the server log, which is the quickest way to check that the link
points at the right host. With `cloudflare` the mail is delivered to the
administrator; the response of the API is the same either way, so the log of
the Cloudflare dashboard is the place to look when a mail does not arrive.

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
  config/              env, database, session store, page list
  models/              mongoose models (Admin, Student, Department, Attendance, …)
  middleware/          requireAuth, requireAdmin, requireAuthPage, CSRF, rate limit, errors
  routes/              API routers
  controllers/         request handlers
  services/            business rules (admins, safety rails, departments, students, attendance, leave sync, leaves, overtime, calendar, dashboard, reports, mailer)
  utils/               dates, validation, responses, pagination, CSV, escaping
public/
  *.html               one file per module (multi page, not an SPA)
  partials/            sidebar + navbar, injected by layout.js
  css/theme.css        design tokens, dark mode, print stylesheet
  js/                  theme, layout, api client, fullscreen, toast, DOM helpers
  vendor/              AdminLTE, Bootstrap, jQuery, Font Awesome, Chart.js, FullCalendar, Toastr
  assets/fonts/        self-hosted Source Sans Pro
seed/seed.ts           creates the first administrator
seed/seed-history.ts   guarded CLI for the 2025-2026 local/test history
seed/seed-history-data.ts deterministic two-year generator, checksum and assertions
seed/seed-demo.ts      local/demo data (departments, students, attendance, leaves, overtime, events)
seed/resync-leaves.ts  recomputes leave days and reconciles every leave after a WORKING_WEEK change
seed/reset-admin-password.ts   emergency password recovery
tests/                 node:test suites (in-memory MongoDB)
legacy/                the previous Laravel application (reference only)
docs/                  the phase 1 audit, the phase 2 report and the phase 3A/3B/3C reports
```

## How the app is put together

* **Multi page, not an SPA.** Every module is its own HTML file. The sidebar
  and the navbar live in `public/partials/` and are injected by
  `public/js/layout.js`, so the navigation is defined exactly once.
* **The pages are protected.** The server checks the session before it serves
  a page and redirects anonymous visitors to `/login.html`.
* **Sessions** live in MongoDB (`connect-mongo`), the cookie is httpOnly,
  `SameSite=Lax` and `secure` in production. `trust proxy` is set to 1.
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

### Working days and leave days

`WORKING_WEEK` (default `1,2,3,4,5`, Monday–Friday) defines the working week.
A leave's `days` is the number of **working days** in the inclusive
`startDate`–`endDate` range — not the number of calendar days. A Saturday–Sunday
request has `days: 0`; a Monday–Friday week has `days: 5`. A leave may cover at
most 366 calendar days.

A date covered by a calendar **bank / company holiday** (`type: 'holiday'`)
never counts, even when it is a working day. The stored `days`, the attendance
sync, the leave preview and the holiday allowance all use the same pure counting
rules in `src/services/leaveCounting.ts`, so they cannot disagree.

A range that crosses a year boundary is allowed. Its counted dates belong to
their **actual calendar year and month**, not to the leave's start date. With a
Monday–Friday week, 30 December 2026 to 2 January 2027 counts two days in 2026
and two in 2027, unless a bank holiday removes one of them. Leave totals, the
month breakdown and the allowance check use the same split. The 366-day limit
still applies.

Creating, editing or deleting a holiday event recomputes the stored `days` for
every leave that overlaps the old and the new event range, reconciles their
attendance rows, and therefore updates the allowance usage too. If
`WORKING_WEEK` changes, the stored `days` and attendance rows are stale. Run:

```bash
npm run resync-leaves
```

It recomputes `days` for every leave from its inclusive range, skips holiday
dates, and reconciles every leave through the same code path as a normal edit.
It is idempotent, safe to run repeatedly, and never touches a manual attendance
row.

Only approved leaves count in the student totals (per actual calendar year and
type), and only approved leaves produce attendance entries. Two approved leaves
of the same student may not overlap (`409 leave_overlap`). A pending request may
overlap provisionally; approval is refused while the overlap exists.

### Holiday allowance

Every student has a holiday allowance per calendar year:

* The default is `ANNUAL_ALLOWANCE_DEFAULT` (28 working days). A missing
  `leaveAllowances` row is not an error: the student just gets the default.
* **No carry-over; the balance resets every 1 January.** Unused days expire on
  31 December and never move to another year. Days used in one year never affect
  another year's balance, in either direction.
* An administrator can edit the allowance per student and year on the student
  profile or in the **Allowances** tab on `/leaves.html`. The value is a day
  count from 0 to 100 in half-day steps; the available total is always the
  allowance. The edit modal states that unused days do not carry over.
* Only **approved vacation** consumes the allowance. `leave` and `time_off`
  never do. Pending vacation is shown separately and does not reduce the
  remaining days; rejected requests are ignored.
* **Remaining** is `allowance − approved vacation used`, so it may legitimately
  be negative after an over-allowance booking is confirmed.
* In a **past year** the third balance is labelled **Holiday unused (expired)**
  and shown in neutral grey, with the note *These days expired on 31 December
  <year>.* A negative past balance is shown in red as **Over allowance**. The
  current and future years keep **Holiday remaining** with the red/amber rules.
  The **Allowances** tab and its CSV use the same wording for the selected year.
* The 28 days are **on top of** bank / company holidays, because holiday dates
  never count as vacation. If your 28 days are meant to include the bank
  holidays, set `ANNUAL_ALLOWANCE_DEFAULT=20`.
* Creating or editing approved vacation that would go below zero returns
  `409 allowance_exceeded` for the actual calendar year that is over. A
  vacation spanning 31 December is checked against each year separately; the
  client can retry the same request with `confirmOverAllowance: true`, and the
  cross-year preview shows both balances. Unused days from the earlier year
  never rescue the later year.
* The edit modal shows a pro-rata hint for a mid-year hire (allowance × full
  months ÷ 12, rounded to the nearest half day). It is only a suggestion and is
  never applied automatically.
* If an older database still has the retired `carryOver` field, remove it with
  the idempotent migration (it touches no other field or collection):

```bash
npm run migrate:allowances
```

### Students terminology migration

Existing databases created before the student rename still use the old
`employees` collection and `employeeId` field. Migrate them once with:

```bash
# print the plan and document counts without writing
npm run migrate:students -- --dry-run

# perform the rename
npm run migrate:students
```

The migration renames the `employees` collection to `students`, applies
`$rename` from `employeeId` to `studentId` in every collection that has the
field, replaces the old indexes with the `studentId` indexes and verifies the
unique `(studentId, date)` attendance index. It checks that all document counts
are unchanged and never touches `admins` or `sessions`. Running it again is a
no-op. If a `students` collection already exists, the migration merges the
legacy documents after refusing duplicate `_id` or email conflicts.

The old pages `/employees.html` and `/employee.html?id=…` answer with permanent
301 redirects to `/students.html` and `/student.html?id=…` (the query string is
preserved). The old `/api/employees…` endpoints no longer exist. Root words such
as "employer" and "employment" are deliberately left unchanged.

Take a `mongodump` before running it against a real database.

### Leave → attendance sync

`src/services/attendanceSync.ts` keeps attendance in step with leaves:

* Only an **approved** leave produces rows. `vacation` becomes the attendance
  status `vacation`; `leave` and `time_off` become `on_leave`.
* Only working days are written. Every generated row carries `source:
  'leave_sync'` and the `leaveId` that created it.
* Only missing `(studentId, date)` rows are inserted. An existing row is never
  overwritten — in particular a `source: 'manual'` row wins, and the unique
  `(studentId, date)` index turns that race into a duplicate-key conflict that
  the sync ignores.
* A leave only ever deletes rows with its own `leaveId`. Editing a generated
  row by hand flips it to `source: 'manual'` and clears `leaveId`, so the leave
  can no longer touch it.
* Saving the daily sheet does **not** rewrite rows whose values did not change.
  The server compares the submitted status, check-in, check-out and note with
  the stored row and skips an identical one, so merely opening and saving the
  sheet leaves every `leave_sync` row attached to its leave. The response says
  how many rows were written and how many were left alone:
  `{ "saved": 0, "unchanged": 3 }`. A real change still turns the row into a
  manual one.
* Every mutation reconciles: create, edit (dates, type, status, student),
  approve, reject, set back to pending and delete. Pending, rejected and
  deleted leaves end with zero rows of their own.
* The reconcile uses `bulkWrite` and no multi-document transaction, so it works
  on a standalone MongoDB. It is idempotent; if a run fails halfway, the next
  mutation repairs the difference.
* Consequence: a generated row that is deleted by hand comes back the next
  time that leave is reconciled. That is intentional — the leave is still the
  source of truth.

Manual attendance can only be marked for today or a past day in
`APP_TIMEZONE`; a future date is refused with `400 date_in_future`. Leave sync
is exempt, because an approved leave for next month legitimately creates
future rows.

### Overtime

Overtime records hours only — there is no money, rate or bonus anywhere.
Entries are booked in quarter-hour steps between 0.25 and 24 hours. Several
entries per student and day are allowed, but their sum may not exceed 24
hours for that day (`422 overtime_day_limit`). The monthly summary groups the
entries per student; both the list and the summary can be exported as CSV,
with the same formula-injection escaping as the attendance export.

### Calendar

The calendar page (`/calendar.html`) uses the vendored **FullCalendar 5.10.1**
directly, without jQuery for the calendar itself. HR events live in the
`events` collection:

| Field | Meaning |
|---|---|
| `type` | `holiday`, `deadline`, `meeting` or `event` |
| `title`, `description` | What the event is |
| `startDate`, `endDate` | Inclusive `YYYY-MM-DD` dates; a one-day event has the same value in both |
| `createdBy`, `updatedBy` | The administrator who wrote it |

There is deliberately no colour field: the colour is derived from `type` in
CSS, so it follows light/dark mode. Clicking a date opens the add modal with
that date; clicking an HR event opens the edit modal with a delete button.
Approved leaves are **not** events — they stay in the `leaves` collection.

`GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD` merges the two sources at
query time:

* only **approved** leaves appear; pending and rejected requests are excluded;
* a leave is titled with the student's name and its type, and links to
  `/leaves.html`;
* the range is validated (`start <= end`) and capped at 400 inclusive days;
* HR events and leaves are filtered by overlap with the requested range.

Everything stays date-only. The API stores an inclusive `endDate`, while
FullCalendar wants an **exclusive** end, so the feed adds exactly one day to
produce its `start`/`end` values. Because no timestamps or timezones are
involved, an all-day event cannot shift when the clocks change for BST.

`holiday` events are bank / company holidays. They are excluded from leave
`days`, from the leave balance and from the attendance rows generated by the
leave sync. Editing or deleting one recomputes every affected leave.

### Dashboard

`/dashboard.html` keeps the AdminLTE look and uses **Chart.js 2.9.4**. The six
cards are for **today in `APP_TIMEZONE`** and count **active students only**:
total students, present, late, absent, on leave (`on_leave` + `vacation`) and
not marked yet. On a non-working day the page shows a notice and hides the
"not marked yet" card, because that number has no meaning there.

The month selector drives both the daily chart and Top Students; the year
selector drives the twelve-month chart. Chart colours are read from the same
CSS custom properties as the rest of the theme and every chart is rebuilt on a
theme change, so dark mode has no stale palette.

Top Students uses `present × 3 − late × 1 − absent × 2` over the selected
month. Leave and vacation days do not appear in the score at all. Only active
students with at least one counted day are eligible; ties are broken by fewer
absences, then more present days, then name. The aggregation projects only
name, position and department — never the photo — so the table cannot leak a
photo into a page or API response.

Departments are shown as a doughnut and a table of **active** student counts.
Both come from aggregation pipelines using the existing indexes, not from one
query per department.

| Endpoint | Purpose |
|---|---|
| `GET /api/dashboard/summary` | Today's cards plus active students per department |
| `GET /api/dashboard/year?year=YYYY` | Twelve month buckets with attendance, absence and leave |
| `GET /api/dashboard/month?month=YYYY-MM` | Daily series plus Top Students |

### Reports

`/reports.html` has three tabs:

1. **Attendance summary** — per student present, late, absent, on leave and
   vacation for a date range, filterable by department or student. The
   attendance rate is `(present + late) / (present + late + absent)`; leave and
   vacation days are excluded from the denominator. The table is paginated and
   carries a totals row. The CSV export contains every filtered row (not just
   the current page) and uses the same formula-injection escaping as the other
   exports.
2. **Overtime** — reuses `GET /api/overtime/summary` for a month and department,
   with the same CSV export.
3. **Leave activity** — reuses `GET /api/leaves` and
   `GET /api/students/:id/leave-totals`. Choosing a student shows their
   approved leave totals by year and type.

Detailed attendance records stay on the existing attendance report page; the
summary links to it. The print stylesheet expands all three tabs, so one print
job covers the whole reports page.

### Demo data (local/demo only)

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/lean-hrm-demo npm run seed:demo
```

`seed:demo` refuses to run when `NODE_ENV=production` and refuses to touch a
database that already contains students. It creates five departments, 25 fake
students, roughly three months of attendance up to yesterday (mostly present,
with some late, absent and unmarked days), six approved leaves through the real
leave reconcile, 30 overtime entries and a few calendar events. The random
generator has a fixed seed, so an empty database produces the same demo data
again. It does not create a login; run `npm run seed` with the `SEED_ADMIN_*`
variables if the database has no administrator yet.

Never point it at a production database: the student check is a safety rail,
not a backup. Use a dedicated local or demo database URI.

### 2025-2026 history dataset (local/test only)

`seed:history` produces a deterministic 22-month HR history from **1 January
2025 to 20 October 2026** for reviewing the dashboard, reports, calendar and
Top Students against realistic records. `seed:2025` is an alias for the same
command and the same two-year dataset.

The marked period ends on **20 October 2026**. Three approved future leaves
create `leave_sync` rows after that date: two students are on leave on 21
October 2026 and one has a December 2026 vacation. No manual attendance is
written after 20 October, and 21 October has no manual rows at all.

Use a **dedicated** database, and create the administrator first:

```bash
# 1. Create the administrator in the same dedicated database.
MONGODB_URI=mongodb://127.0.0.1:27017/lean-hrm-2025-test \
SEED_ADMIN_NAME="2025 Test Admin" \
SEED_ADMIN_EMAIL=admin@example.com \
SEED_ADMIN_PASSWORD='choose-a-local-password' \
npm run seed

# 2. Generate the history. On an existing seed database, add --reset.
MONGODB_URI=mongodb://127.0.0.1:27017/lean-hrm-2025-test \
SEED_ADMIN_EMAIL=admin@example.com \
npm run seed:history -- --reset

# 3. Run the app against the same database.
MONGODB_URI=mongodb://127.0.0.1:27017/lean-hrm-2025-test \
npm start
```

The command prints a full verification report: the 22-month attendance table,
yearly totals and shares, the partial October 2026 working-day count, event
counts by type and month, multi-day and edge-case events, Top Students hand
checks, the fixed 21 October dashboard/sheet checks, both bank-holiday leave
cases, a per-student holiday allowance table for 2025 and 2026 (allowance,
used, pending and remaining) and every assertion.

#### Profile photos

`seed:history` deliberately creates students **without** photos, and asserts
that none were written. A re-seed therefore clears them. To review the UI with
portraits, the repository ships 26 local headshots in
`public/images/students/` (one JPEG per student name, sourced from
[randomuser.me](https://randomuser.me) for local demo use):

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/lean-hrm-2025-test npm run seed:photos
```

The script matches `amelia-bennett.jpg` to student "Amelia Bennett", stores the
bytes on the student document and skips anything it cannot match. Photos are
served by `GET /api/students/:id/photo`; the `/images` folder is also served
statically for local reference.

#### Safety rails

* It refuses when `NODE_ENV=production`, before it connects.
* It refuses unless the database part of `MONGODB_URI` contains `test` or
  `demo`. The error states that rule. This is a name check, not a substitute
  for using a dedicated database and database user.
* It requires an existing **active** administrator. It prefers
  `SEED_ADMIN_EMAIL` when that active administrator exists, otherwise it uses
  the oldest active administrator and prints a warning. The script never
  creates, updates or deletes an administrator.
* It refuses when students already exist unless `-- --reset` is supplied.
* `--reset` deletes only `attendance`, `overtime`, `leaves`, `events`,
  `students` and `departments`. Administrators and sessions are never touched.
* It forces `APP_TIMEZONE=Europe/London` and `WORKING_WEEK=1,2,3,4,5` for its own
  process. Every date is a fixed `YYYY-MM-DD` value; the system clock is never
  used to choose history dates.

Two runs against a fresh test database print the same SHA-256 checksum. The
checksum canonicalises business rows and includes events; database-generated
ObjectIds and `createdAt`/`updatedAt` values are excluded. The in-memory test in
`tests/seed-history.test.ts` runs the generator twice and checks this, plus the
calendar, dashboard and attendance-sheet cases.

#### What is generated

| Area | Data |
|---|---|
| Departments | 5: Operations, Finance, Human Resources, Sales and IT, with unequal student counts (7 / 5 / 4 / 6 / 4) |
| Students | 26: 23 active, 1 inactive on 31 March 2026, 1 terminated on 30 June 2025 and 1 terminated on 14 August 2026; 3 hired during 2025, 2 during 2026; 5 without an email; no photos |
| Attendance | 10,414 rows: 10,216 manual and 198 `leave_sync`. One manual row per student per Mon–Fri working day inside employment up to 20 October 2026, excluding the England bank holidays and 31 deliberately unmarked days (0.3% of 10,435 expected slots) |
| Attendance mix | About 90% present, 7% late and 3% absent among counted days, close to the requested 88 / 7 / 3. Present check-in is 08:30–09:00 and checkout 17:00–18:15; late check-in is 09:10–10:30. Absences form runs of 1–3 working days and are heavier in January–February |
| Leaves | 73 approved (40 in 2025, 30 in 2026 through 20 October and 3 future), 10 pending and 6 rejected, created through the real leave/reconcile service. Types are `leave` (casual/sick/personal), `vacation` (annual) and `time_off`. The 73 leaves contain 200 approved working days; 198 `leave_sync` rows remain because 2 leave days were manually overridden with `present` |
| Overtime | 260 entries: 150 in 2025 and 110 in 2026 through 20 October, spread across all 22 months. 0.5–4 hours in 0.25-hour steps, only on days the student actually worked |
| Events | 148: 75 in 2025 and 73 in 2026. 2025 has 9 holiday, 21 deadline, 29 meeting and 16 event entries; 2026 has 9 holiday, 20 deadline, 29 meeting and 15 event entries. No leave/vacation event types and no payroll/salary/bonus wording |

Leave rules: approved leaves never overlap for the same student, every leave
is within one calendar year, and no leave starts before hire or ends after the
student's leaving/deactivation date. Pending and rejected leaves create no
attendance rows. Two approved leave days are deliberately overridden by a
manual `present` row, so they demonstrate the real sheet behaviour where an
edit detaches a `leave_sync` row from its leave.

The two documented bank-holiday leave cases are:

* **Harry Nelson, 5–7 May 2025** — three working days including the Early May
  bank holiday on 5 May.
* **Grace Morgan, 4–6 May 2026** — three working days including the Early May
  bank holiday on 4 May.

In both cases the leave service counts the bank holiday as a leave day and the
reconcile creates a real `leave_sync` row on it. Holiday events are
informational only: they do not change a leave's `days` or the leave totals.

The three future leaves are Amelia Bennett (21–23 October 2026, vacation), Noah
Carter (21–22 October 2026, time off) and Isla Dawson (21–23 December 2026,
vacation). On **21 October 2026** the dashboard therefore shows 23 active
students, 2 on leave and 21 not marked; the attendance sheet for that date has
only those two `leave_sync` rows.

October 2026 is partial: **14 working days** through 20 October, out of 22
working days in the full month. The full 2026 year has no manual attendance or
absence after October; the only later rows are the approved December leave
sync.

#### Calendar and report edge cases

* At least three events cross a month boundary in both years: the Q2–Q4
  `Leave plan submission` deadline windows (31 March → 2 April, 30 June →
  2 July, 30 September → 2 October).
* Christmas office closures run 29–31 December in both 2025 and 2026; the last
  day is included and the feed gives FullCalendar an exclusive `end` of
  1 January.
* A Saturday `Summer company day` exists in both years (19 July 2025 and
  18 July 2026).
* 12 December 2025 and 11 December 2026 each have two events (`Health & safety
  training` and `Christmas party`). 18 September 2025 also has two.
* Date-only clock-change events stay on 30 March and 26 October 2025 and on
  29 March and 25 October 2026 through the BST changes.
* `Year-end review` on 19 December 2025 appears beside approved leave for
  Harry Nelson, and the 21 October 2026 `Autumn away day` appears beside the
  two future approved leaves.
* Pending and rejected leaves never appear in the calendar feed.
* The two terminated students have no attendance after their leaving dates;
  the inactive student has none after 31 March 2026; the 2025 and 2026 hires
  have no attendance before their hire dates.
* The clock-change, month-crossing, multi-day, crowded-day, Christmas-closure
  and leave-day cases are all included in the printed edge-case report and in
  the browser audit.

To inspect the history, choose 2025 or 2026 in the dashboard year selector,
open the attendance sheet for 20 October and 21 October 2026, run the attendance
report across 2025–2026, and step through the calendar in month, week and list
views for March, May, July, October and December in both years. Maya Patel and
Oliver Grant are the 2026 hires to open from the student list.

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
| `DELETE` | `/api/admins/:id` | Delete an administrator (guarded by history and safety rails) |
| `POST` | `/api/admins/bulk` | Disable or delete several administrators atomically |
| `POST` | `/api/admins/:id/activate` | Activate an administrator (kept for compatibility) |
| `POST` | `/api/admins/:id/deactivate` | Deactivate an administrator (kept for compatibility) |
| `POST` | `/api/admins/me/password` | Change your own password |
| `GET` | `/api/departments` | Departments with the number of students |
| `POST` | `/api/departments` | Create a department |
| `PATCH` | `/api/departments/:id` | Rename a department |
| `DELETE` | `/api/departments/:id` | Delete a department (only when it is empty) |
| `GET` | `/api/students` | Students — paginated, searchable, filterable |
| `POST` | `/api/students` | Create a student |
| `GET` | `/api/students/:id` | One student |
| `PATCH` | `/api/students/:id` | Change a student |
| `DELETE` | `/api/students/:id` | Delete a student (only without any records) |
| `GET` | `/api/students/:id/photo` | The photo (never part of a list) |
| `GET` | `/api/students/:id/attendance` | The attendance of one student, per month |
| `GET` | `/api/students/:id/leaves` | The leave history of one student |
| `GET` | `/api/students/:id/leave-totals` | Approved leave days per actual year and type |
| `GET` | `/api/students/:id/allowance?year=YYYY` | Holiday allowance summary and month breakdown |
| `GET` | `/api/students/:id/allowance/month?year=YYYY&month=M` | Approved vacation days counted in one month |
| `PUT` | `/api/students/:id/allowance/:year` | Set the allowance and note for one year |
| `GET` | `/api/attendance/sheet` | The daily sheet for a date |
| `POST` | `/api/attendance/sheet` | Save the whole sheet in one request |
| `GET` | `/api/attendance` | The report — filtered, paginated, with counts |
| `GET` | `/api/attendance/export.csv` | The report as a CSV file |
| `POST` | `/api/attendance` | Add a single record |
| `PATCH` | `/api/attendance/:id` | Change a record |
| `DELETE` | `/api/attendance/:id` | Delete a record |
| `GET` | `/api/overtime` | Overtime entries — date range, student, department |
| `POST` | `/api/overtime` | Add an overtime entry |
| `PATCH` | `/api/overtime/:id` | Change an overtime entry |
| `DELETE` | `/api/overtime/:id` | Delete an overtime entry |
| `GET` | `/api/overtime/summary` | Per student hours and entries for a month |
| `GET` | `/api/overtime/export.csv` | The entries as a CSV file |
| `GET` | `/api/overtime/summary.csv` | The monthly summary as a CSV file |
| `GET` | `/api/leaves` | Leave records — student, department, type, status, dates |
| `POST` | `/api/leaves` | Create a leave |
| `GET` | `/api/leaves/:id` | One leave |
| `PATCH` | `/api/leaves/:id` | Change a leave (including approve/reject) |
| `DELETE` | `/api/leaves/:id` | Delete a leave and its generated attendance |
| `GET` | `/api/leaves/export.csv` | The leave records as a CSV file |
| `GET` | `/api/leaves/preview` | Counted days, skipped dates and allowance impact for a proposed leave |
| `GET` | `/api/leaves/allowances` | Per-student allowance overview (year, department, search, month) |
| `GET` | `/api/leaves/allowances/export.csv` | Every filtered allowance row as a CSV file |
| `GET` | `/api/calendar` | HR events + approved leaves for a date range |
| `POST` | `/api/events` | Create an HR calendar event |
| `PATCH` | `/api/events/:id` | Change an HR calendar event |
| `DELETE` | `/api/events/:id` | Delete an HR calendar event |
| `GET` | `/api/dashboard/summary` | Today's cards and active students per department |
| `GET` | `/api/dashboard/year?year=YYYY` | Twelve month attendance/absence/leave series |
| `GET` | `/api/dashboard/month?month=YYYY-MM` | Daily series and Top Students |
| `GET` | `/api/reports/attendance-summary` | Per-student summary with rate and totals |
| `GET` | `/api/reports/attendance-summary.csv` | The summary as a CSV file |

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
* An administrator who is referenced as `createdBy`, `updatedBy` or
  `decidedBy` in attendance, overtime, leaves, leave allowances or calendar
  events cannot be deleted — `409 admin_has_records` with the message:
  “This admin has history and cannot be deleted. Disable the account instead.”
  Disable the account instead so the audit trail stays intact.

`POST /api/admins/bulk` accepts `{ "action": "disable" | "delete", "ids": [...] }`.
Every target is checked before the first write, so the operation is
all-or-nothing: it can never remove the signed-in admin, leave zero active
administrators, or delete someone with history. A refusal returns `409
bulk_rejected` with a `details` array containing one `{ id, code, message }` per
offending id. The single-admin disable rails remain `400
cannot_deactivate_self` and `400 cannot_deactivate_last_admin` for compatibility
with the activate/deactivate endpoints.

## Status

* **Phase 1** — audit and decisions: [`docs/PHASE-1-AUDIT.md`](docs/PHASE-1-AUDIT.md)
* **Phase 2** — foundation, shell and authentication:
  [`docs/PHASE-2-REPORT.md`](docs/PHASE-2-REPORT.md)
* **Phase 3A** — departments, students, attendance and the administrator
  password reset: [`docs/PHASE-3A-REPORT.md`](docs/PHASE-3A-REPORT.md)
* **Phase 3B** — overtime, leave & vacation, and the leave → attendance sync:
  [`docs/PHASE-3B-REPORT.md`](docs/PHASE-3B-REPORT.md)
* **Phase 3C** — calendar, dashboard, reports and demo data:
  [`docs/PHASE-3C-REPORT.md`](docs/PHASE-3C-REPORT.md)
* **Next** — owner review of phase 3C.
# Care-Attendance-System
