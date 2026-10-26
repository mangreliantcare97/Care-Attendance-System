# Phase 3B — Overtime, Leave & Vacation + the leave → attendance sync

**Branch:** `rebuild/lean-hrm`
**Scope:** the fixes agreed after phase 3A, overtime, leave & vacation, the
leave → attendance sync and the employee leave totals.

Phase 1 audit: [`PHASE-1-AUDIT.md`](PHASE-1-AUDIT.md) · Phase 2:
[`PHASE-2-REPORT.md`](PHASE-2-REPORT.md) · Phase 3A:
[`PHASE-3A-REPORT.md`](PHASE-3A-REPORT.md)

---

## 1. Fixes first

### Employee form defaults to *active*

The status select in the employee form lists **Active** first and a new
employee is created as `active` (previously the form preselected `inactive`).
The value is still validated server-side against the `active` / `inactive` /
`terminated` enum, and the API default for a create request that omits
`status` remains `inactive` — a direct API caller still has to opt in.

### Attendance cannot be marked in the future

`POST /api/attendance/sheet` and `POST /api/attendance` now refuse a date after
"today" in `APP_TIMEZONE` with:

```json
{ "success": false, "error": { "code": "date_in_future", "message": "…" } }
```

`today()` follows the configured timezone, never the server's UTC offset. The
leave sync is exempt: an approved leave for next month legitimately creates
future rows. The daily sheet response also carries `today`, and the client caps
the date picker with it.

### The attendance report edits in a modal

The `prompt()` in the report is gone. Edit opens a Bootstrap modal with the
status, check-in, check-out and note, all prefilled from the row. The server
validates the payload with zod; the page reports success and failure with
toastr and respects dark mode through the shared theme.

### Timezone tests

`tests/dates.test.ts` pins the awkward cases:

* 23:30 UTC on a BST date (`2026-06-15T23:30Z`) is **the next day** in
  `Europe/London` — the same instant in January (GMT) stays on the same day.
* Month boundaries roll over in `APP_TIMEZONE`: 23:30 UTC on 31 May is
  1 June, so `currentMonth()` is June; 31 January at the same UTC time stays
  January.
* `isAfterToday()` and `workingDaysBetween()` are deterministic because
  `today()` / `currentMonth()` / `nowTime()` accept an optional `now: Date`.

---

## 2. Overtime

**Hours only** — there is no money, rate, salary or bonus field anywhere.

Fields: `employeeId`, `date` (`YYYY-MM-DD`), `hours` (0.25–24, step 0.25),
`note`, `createdBy`, `updatedBy`.

| Endpoint | Purpose |
|---|---|
| `GET /api/overtime` | Entries — date range, employee, department, pagination |
| `POST /api/overtime` | Create an entry |
| `PATCH /api/overtime/:id` | Change an entry |
| `DELETE /api/overtime/:id` | Delete an entry |
| `GET /api/overtime/summary?month=YYYY-MM[&departmentId]` | Per-employee total hours + entry count |
| `GET /api/overtime/export.csv` | The entry list as CSV |
| `GET /api/overtime/summary.csv` | The monthly summary as CSV |

* Several entries per employee and day are allowed, but the **sum for the
  day may not exceed 24 hours**. Creating or editing past that point is refused
  with `422 overtime_day_limit`; exactly 24 is allowed. The record being
  edited is excluded from the sum.
* Hours are validated by zod *and* by the model (`multipleOf 0.25`).
* The list returns the total hours of the filtered set; the summary groups by
  employee and returns the number of entries.
* Both exports use the shared `toCsv` — a cell starting with `=`, `+`, `-` or
  `@` is prefixed with an apostrophe.

Page: `overtime.html` — filters, paginated entries, add/edit modal, monthly
summary with its own department filter and both CSV exports.

## 3. Leave & vacation

One `leaves` collection for the old `leaves` + `vacations` tables.

Fields: `employeeId`, `type` (`leave` | `vacation` | `time_off`), `category`,
`startDate`, `endDate`, `days`, `reason`, `status` (`pending` | `approved` |
`rejected`), `decidedBy`, `decidedAt`, `createdBy`, `updatedBy`.

| Endpoint | Purpose |
|---|---|
| `GET /api/leaves` | Employee, department, type, status, date range, pagination |
| `POST /api/leaves` | Create (status defaults to `pending` in the API) |
| `GET /api/leaves/:id` | One leave |
| `PATCH /api/leaves/:id` | Change — this is also how a leave is approved or rejected |
| `DELETE /api/leaves/:id` | Delete the leave and its generated attendance |
| `GET /api/leaves/export.csv` | The list as CSV |
| `GET /api/employees/:id/leave-totals` | Approved days per year and type |

### Working days

`days` is the number of **working days** in the inclusive range, according to
`WORKING_WEEK` (Monday–Friday by default) — not calendar days. A
Saturday–Sunday request has `days: 0`; a Monday–Friday week has `days: 5`.
This is the same number the attendance sync uses, so the total and the rows
always agree. A range is rejected when the end is before the start
(`leave_range_invalid`) or when it covers more than 366 days
(`leave_span_too_long`).

### Overlap rule

A leave whose resulting status is `approved` may not overlap another
**approved** leave of the same employee. The check runs on create and on every
edit that leaves it approved (including the date edit of an approved leave),
and returns `409 leave_overlap` with the conflicting leave id. A pending
request may overlap provisionally; approving it later is refused until the
overlap is removed.

### Decisions and totals

`decidedBy` / `decidedAt` are set when a leave becomes approved or rejected,
and cleared when it is put back to pending. Approved days are totalled per
**calendar year of the start date** and per type on the employee profile
(`leave`, `vacation`, `time_off`, `total`); pending and rejected leaves are
ignored.

The form defaults to **approved**, as agreed, and the status can be changed
later from the same modal. Date filters on the list select leaves that
**overlap** the range.

---

## 4. The leave → attendance sync

`src/services/attendanceSync.ts` is the single writer of generated attendance.

* `desiredRowsForLeave()` is pure: an approved leave produces one row per
  working day, with status `vacation` for `vacation` and `on_leave` for
  `leave` / `time_off`. Pending and rejected leaves produce nothing.
* Every generated row is stamped `source: 'leave_sync'` and the `leaveId` that
  created it.
* `reconcileLeave(leaveId)` is idempotent:
  1. delete the rows **this leave owns** whose day left the range or whose
     employee changed;
  2. refresh the status of its remaining rows (the type may have changed);
  3. insert the missing days only.
* Only missing `(employeeId, date)` rows are inserted. An existing **manual**
  row is never overwritten — the unique `(employeeId, date)` index turns that
  into a duplicate-key conflict, which is ignored.
* A leave never deletes a row it does not own. Editing a generated row by hand
  flips it to `source: 'manual'` and clears `leaveId`, so the leave can no
  longer touch it.
* Reconciliation runs on **create, every edit (dates / type / status /
  employee), approve, reject, set back to pending and delete**. Pending,
  rejected and deleted leaves end with zero rows of their own. Moving a leave
  to another employee cleans the old employee's rows because deletion is keyed
  by `leaveId`, not by employee.
* `bulkWrite` with `ordered: false` is used; there is **no multi-document
  transaction**, so the app works against a standalone MongoDB. If a run fails
  halfway, the next mutation repairs the difference.
* Consequence, documented in the README: a generated row deleted by hand comes
  back the next time that leave is reconciled — the leave is the source of
  truth.

### Delete guard

The employee hard-delete guard counts **attendance, overtime and leave**
records (`409 employee_has_records`). Phase 3B added explicit tests for the
overtime and leave branches.

---

## 5. Pages

* `leaves.html` / `js/leaves.js` — filters (dates, employee, department, type,
  status), paginated table, add/edit modal with **approved** as the default,
  delete, CSV export.
* `overtime.html` / `js/overtime.js` — filters, paginated entries with the
  filtered total, add/edit modal, monthly summary with per-employee totals and
  both CSV exports.
* `employee.html` / `js/employee.js` — "Approved days by year" table above the
  leave history.
* `attendance-report.html` — the edit modal that replaced `prompt()`.
* `employees.html` — Active is the first status option.
* `attendance.html` — the server's `today` caps the date picker.
* The sidebar entries for overtime and leave already existed; the pages use
  `data-page="overtime"` / `data-page="leaves"`, so the active state, the dark
  mode and the responsive tables come from the shared shell.

---

## 6. Quality

* **zod** validates every body, query and parameter of both new modules.
* **CSRF** on every mutating request (global middleware) and
  **requireAuth + requireAdmin** on both routers.
* **No `innerHTML` with user data** — the new pages use the `HrmDom.html`
  escaped template and `HrmDom.renderRows`.
* **toastr** for feedback, `window.confirm` only for the delete confirmations.
* No new dependency and no build step: this app is multi-page and served
  directly, so `npm run build` does not exist; `npm run typecheck` is the
  static check.

---

## 7. Verification

```
npm run typecheck   →  no errors
npm test            →  132 tests, 132 passing
```

New/extended suites:

* `tests/dates.test.ts` — BST/GMT day and month boundaries, working days,
  leap day, date validation.
* `tests/leaves.test.ts` — working-day computation, reversed range, 366-day
  span, overlap (approved and pending→approved), approved rows on working days
  only, vacation mapping, pending/rejected create nothing, approve→reject
  removes only its own rows, manual rows never touched, manual detach, date
  edits, employee move, delete cleanup, idempotency, two employees, totals per
  year/type, filters, CSV escaping, delete guard, auth + CSRF.
* `tests/overtime.test.ts` — CRUD, several entries per day, 24-hour limit on
  create and edit, quarter-hour steps, monthly summary, both CSV exports,
  delete guard, auth + CSRF.
* `tests/attendance.test.ts` — future-date refusal, the sheet's `today`.

Manual drive against the local MongoDB (the flow requested for approval):

```
server today: 2026-10-21
leave: 2026-10-12..2026-10-16 days=5
14 Oct after vacation: status=vacation source=leave_sync leaveId=…
14 Oct manual edit: status=present source=manual leaveId=(cleared)
leave extended: 2026-10-12..2026-10-20 days=7
14 Oct after extension: status=present source=manual leaveId=(cleared)
19 Oct new sync day: status=vacation source=leave_sync
rows in October: 7
  2026-10-12 vacation leave_sync
  2026-10-13 vacation leave_sync
  2026-10-14 present  manual
  2026-10-15 vacation leave_sync
  2026-10-16 vacation leave_sync
  2026-10-19 vacation leave_sync
  2026-10-20 vacation leave_sync
leave deleted
rows after leave delete: 1 (the manual 14 Oct row)
```

The test employee, leave and manual row were removed afterwards. All pages
(`leaves.html`, `overtime.html`, `attendance-report.html`, `employee.html`)
were also requested with a real session and answered `200`.

---

## 8. Still open

* The calendar and the dashboard (the next phase).
* Payroll and any money-related feature remain explicitly out of scope.
