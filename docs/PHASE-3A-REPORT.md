Terminology: 'employee' in this document means 'student' since the rename.

# Phase 3A — Departments, Employees, Attendance + admin password reset

**Branch:** `rebuild/lean-hrm`
**Scope:** the departments, employees and attendance modules (API, pages and
tests) and the forgotten-password flow for administrators, sent through the
Cloudflare Email Service.

Phase 1 audit: [`PHASE-1-AUDIT.md`](PHASE-1-AUDIT.md) · Phase 2:
[`PHASE-2-REPORT.md`](PHASE-2-REPORT.md)

---

## 1. Pre-flight

| Check | Result |
|---|---|
| `npm run typecheck` | no errors |
| `npm test` | 30 tests, 30 passing (before this phase) |
| `engines.node` | `>=22.18` — already present in `package.json` |

### Content Security Policy

The vendored libraries were audited before the new pages were written:

| Library | `eval` / `new Function` | Inline script | Inline style |
|---|---|---|---|
| AdminLTE 3.2 | no | no | yes (element styles) |
| Bootstrap 4 bundle | no | no | yes (modals, dropdowns) |
| jQuery 3.6 | no | no | no |
| Chart.js 2.9.4 | no | no | yes (canvas) |
| FullCalendar 5.10 | no | no | yes |
| Toastr | no | no | yes |

(The two "eval" hits in jQuery were false positives — `setInterval(` contains
the string `eval(`.)

The policy was made explicit without being loosened:

```
default-src 'self'; script-src 'self'; script-src-attr 'none';
style-src 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline';
style-src-elem 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self' data:; connect-src 'self'; object-src 'none';
frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

* **Scripts:** same origin only. There is not a single inline `<script>` or
  `onclick=` handler in the app — the two that the phase 2 shell contained
  were removed.
* **Styles:** inline styles stay allowed, because AdminLTE, Bootstrap (the
  modals) and Chart.js set element styles from JavaScript. The login and
  password reset screens also carry an inline `<style>` block, which
  `style-src-elem` allows.
* `script-src-attr 'none'` makes the "no inline event handlers" rule explicit.

---

## 2. Departments

| Endpoint | Purpose |
|---|---|
| `GET /api/departments` | All departments with their employee count |
| `POST /api/departments` | Create |
| `PATCH /api/departments/:id` | Rename / change location and description |
| `DELETE /api/departments/:id` | Delete — refused while employees exist |

* The name is unique (`409 department_name_taken`).
* The employee count comes from an **aggregation** (`$group` over the
  employees), never from a stored counter, so it cannot drift.
* Deleting a department that still has employees is refused with
  `409 department_has_employees` and the number of employees in the message.

## 3. Employees

Fields: name, email (optional), phone, department, position, hire date, photo,
status (`active` / `inactive` / `terminated`). **No salary or payroll fields
anywhere.**

* **New employees are inactive** — activation is a deliberate act.
* **Email:** optional and unique. An empty address is stored as `null`; the
  index is unique with a partial filter on `{$type: 'string'}`, so any number
  of employees may have no address while a real address can only be used once.
* **Photo:** base64 `{data, mime, size}` in the employee document, maximum
  **256 KB**. The server measures the *decoded* bytes (not what the client
  claims) and checks the magic bytes of the file — a picture that claims to be
  a PNG but is a GIF is refused (`photo_type_mismatch`), and data that is not
  an image at all is refused (`photo_type_not_allowed`). The browser scales
  the picture down to 512 px before it is uploaded.
* **The photo is never part of a list answer** — every query uses
  `select('-photo')`. It is served on its own by
  `GET /api/employees/:id/photo` with `Cache-Control: private, max-age=86400`
  and an `ETag` (a `304` is answered when the `If-None-Match` header matches).
* **Pagination and search happen on the server**: `page`, `perPage`, `search`
  (name, email or position), `departmentId` and `status`.
* **Hard delete is blocked** when the employee has attendance, overtime or
  leave records (`409 employee_has_records`) — that history has to stay
  readable. Deactivate the employee instead.
* **Profile page** (`/employee.html?id=…`): personal record, attendance per
  month with the counts of present / late / absent / on leave / vacation, and
  the leave history.

## 4. Attendance

* **Dates** are `YYYY-MM-DD` strings, computed in `APP_TIMEZONE`. The unique
  index `{employeeId: 1, date: 1}` is in place; a second record for the same
  employee and day is refused with `409 duplicate_attendance`.
* **The daily sheet** (`GET /api/attendance/sheet?date=…`) lists the active
  employees with the record of that day. The whole sheet is saved in **one
  request** (`POST /api/attendance/sheet`); only the employees that were
  actually marked are written — everybody else stays *not marked yet* and is
  never counted as absent.
* Records can be added, changed and deleted at any time, including for past
  dates. `createdBy` and `updatedBy` are stored.
* **Editing a record that came from a leave** (`source: 'leave_sync'`) turns
  it into a manual record (`source: 'manual'`).
* **The report** (`GET /api/attendance`) filters by date range, department and
  employee, paginates, and returns the counts of the five statuses.
* **CSV export** (`GET /api/attendance/export.csv`) escapes a cell that starts
  with `=`, `+`, `-` or `@` with an apostrophe, so a spreadsheet application
  cannot execute it as a formula.
* The print stylesheet of phase 2 applies to the report page.

## 5. Forgotten password (administrators only)

### The mailer — `src/services/mailer.ts`

```ts
interface Mailer { send(message: { to, subject, text, html, replyTo? }): Promise<void> }
```

The provider is selected by `MAIL_PROVIDER`:

| Provider | Behaviour |
|---|---|
| `none` (default) | Nothing happens — a fresh installation never sends mail |
| `console` | The mail, including the reset link, is printed to the server log |
| `cloudflare` | The Cloudflare Email Service REST API |

The Cloudflare provider calls
`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send`
with `Authorization: Bearer <token>`. The payload follows the **REST**
reference (not the Workers binding):

```json
{
  "from": { "address": "noreply@example.com", "name": "Human Resource" },
  "to": ["admin@example.com"],
  "reply_to": "noreply@example.com",
  "subject": "…", "text": "…", "html": "…"
}
```

`from` is an object keyed by **`address`** (the Workers binding uses `email`)
and the reply address is **`reply_to`** in snake_case. CR/LF are stripped from
everything that ends up in a header, and user data in the body is HTML
escaped. A provider that is not configured throws — the error is logged on
the server and the public answer stays the same.

### The endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/forgot-password` | `{email}` — always the same 200 answer |
| `POST /api/auth/reset-password` | `{token, password}` |

* The answer is **identical** for an unknown address, an inactive
  administrator and an active administrator, and the response time is padded
  to at least 250 ms so the difference is not measurable.
* Only an **active administrator** receives a mail. Employees live in another
  collection, so an employee address can never trigger a reset.
* Both endpoints are rate limited — per IP (express-rate-limit) and, for the
  request, per email address (the key is the SHA-256 of the address).
* The mail is sent without being awaited, so a slow provider cannot slow the
  answer down.

### The token

* `crypto.randomBytes(32)` — 64 hexadecimal characters.
* Only the **SHA-256 hash** is stored, in a `passwordResets` collection with a
  TTL index (30 minutes).
* Requesting a new token removes the older tokens of that administrator.
* The hash is compared with `timingSafeEqual`; a token can be used **once**.
* The link is built from `APP_BASE_URL` — **never** from `req.headers.host`,
  so a forged `Host` header cannot send an administrator to a hostile site.

### After a successful reset

The new password is hashed with bcrypt (12 rounds), **every session of that
administrator is deleted from the session store**, the reset tokens are
removed, a "your password was changed" notice is sent — and the administrator
is **not** signed in automatically.

### The pages

* `forgot-password.html` and `reset-password.html` in the style of the login
  screen, with dark mode. They are reachable without a session but are not
  linked from the app shell.
* The login page links to "Forgot password?".
* `reset-password.html` is sent with `Referrer-Policy: no-referrer` (as a
  **header** — the header wins over the meta tag) and removes the token from
  the address bar with `history.replaceState` right after reading it.
* The admins page carries a note that an administrator address has to be
  verified in Cloudflare (*Email Routing → Destination addresses*) before it
  can receive a reset mail.

### Recovery when an administrator is locked out

```bash
RESET_ADMIN_PASSWORD='a-new-password' npm run reset-admin-password -- admin@example.com
```

The password is read from the environment — never from the command line (it
would end up in the shell history) and never from the repository.

---

## 6. Quality

* **zod** validates every input — body, query and parameters.
* **CSRF** on every mutating request (the two unauthenticated password
  endpoints are the documented exception — there is no session to protect).
* **requireAuth + requireAdmin** on every module route.
* **No `innerHTML` with user data**: the client builds its tables with the
  `HrmDom.html` tagged template, which escapes every interpolated value.
* **toastr** instead of `alert()` — except for the two confirmations
  ("delete this?"), which use `window.confirm` on purpose.
* Responsive tables (`.table-responsive`), dark mode on every new page and the
  print stylesheet for the report.

---

## 7. Verification

```
npm run typecheck   →  no errors
npm test            →  91 tests, 91 passing
```

The new suites cover the duplicate attendance, the photo limits (size, type,
mismatch), the hard delete guard, the department guard, the CSRF and the
authentication on every new route, the pagination and the filters — and for
the password reset: the same answer for unknown / inactive / active
addresses, the token expiry, the single use, a forged token, the revoked
sessions, the rate limit, the employee address and the mailer providers
(`none`, `console` and a mocked Cloudflare HTTP call).

The app was also run locally against MongoDB and driven by hand: departments,
employees (including a photo upload and the photo endpoint), the daily sheet,
the report, the CSV export, the whole password reset flow (request → mail →
reset → the old session is dead → the old password no longer works → the same
token cannot be used twice) and every page.

## 8. Still open (phase 3B)

* Overtime, leave & vacation, the calendar and the dashboard.
* The leave → attendance sync and the overlap rule.
* Editing a record in the report (the status is asked for with `prompt()` at
  the moment — it deserves a proper form).
