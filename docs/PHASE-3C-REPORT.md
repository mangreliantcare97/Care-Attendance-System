Terminology: 'employee' in this document means 'student' since the rename.

# Phase 3C — Calendar, dashboard, reports and demo data

**Branch:** `rebuild/lean-hrm`
**Scope:** the three fixes agreed after phase 3B, the calendar, the dashboard,
the reports module and the demo seeder.

Phase 1 audit: [`PHASE-1-AUDIT.md`](PHASE-1-AUDIT.md) · Phase 2:
[`PHASE-2-REPORT.md`](PHASE-2-REPORT.md) · Phase 3A:
[`PHASE-3A-REPORT.md`](PHASE-3A-REPORT.md) · Phase 3B:
[`PHASE-3B-REPORT.md`](PHASE-3B-REPORT.md)

---

## 1. Fixes first

### 1.1 Saving the daily sheet no longer detaches unchanged leave rows

The sheet used to rewrite every submitted row. A `leave_sync` row was therefore
turned into a manual row even when nothing had changed, which detached it from
its leave.

`saveSheet` now bulk-loads the stored rows for the submitted date and compares
the status, check-in, check-out and note. Rows that are identical are skipped:

* an untouched `leave_sync` row keeps `source: 'leave_sync'` and its `leaveId`;
* a row with any real change is written and becomes `source: 'manual'`;
* the response reports what happened: `{ saved, unchanged, records }`.

The sheet client (`public/js/attendance.js`) displays both numbers. The
regression test
`keeps an untouched leave_sync row attached when the sheet is saved` verifies the
unchanged path; the existing
`turns a leave_sync record into a manual one when it is edited` verifies the
changed path.

### 1.2 `resync-leaves`

When `WORKING_WEEK` changes, both the stored `days` and the generated
`leave_sync` rows are stale. The new command:

```bash
npm run resync-leaves
```

recomputes `days` for every leave from its inclusive range, then runs the real
reconcile for every leave. Approved leaves refresh their generated rows;
pending, rejected and deleted leaves lose any rows they still own. Manual
attendance rows are never touched and the command is idempotent.

Verified on a disposable database:

| Step | Total leave days | `leave_sync` rows | Manual rows |
|---|---:|---:|---:|
| seeded with Mon–Fri | 12 | 12 | 1433 |
| `WORKING_WEEK=1,2,3`, first resync | 7 | 7 | 1433 |
| second resync with the same setting | 7 | 7 | 1433 |

The first resync updated 4 of the 6 leave day counts; the second reported
`0 day count(s) updated`. The temporary database was dropped afterwards.
`README.md` documents the command in the working-days section.

### 1.3 Leave year and holidays

The README now states both rules explicitly:

* a leave belongs to the year of its **start date**, even when the range crosses
  into January;
* calendar **holiday events are informational only** — they are not working
  days and never change leave `days`, leave totals or attendance.

## 2. Calendar

### Backend

The `events` collection stores:

| Field | Meaning |
|---|---|
| `type` | `holiday`, `deadline`, `meeting` or `event` |
| `title`, `description` | Event text |
| `startDate`, `endDate` | Inclusive `YYYY-MM-DD` dates; a one-day event uses the same value twice |
| `createdBy`, `updatedBy` | Administrator references |

There is no colour field; colours are assigned by type in CSS. Event creation,
editing and deletion are validated with zod, require an authenticated
administrator and require CSRF. The endpoints are `POST /api/events`,
`PATCH /api/events/:id` and `DELETE /api/events/:id`.

`GET /api/calendar?start=&end=` merges two sources at query time:

* HR events that overlap the requested range;
* **approved** leaves only — pending and rejected requests are excluded.

A leave event includes the employee name, the leave type and a link to
`/leaves.html`. The range must satisfy `start <= end` and may span at most 400
inclusive days.

The API stores an inclusive end. FullCalendar uses an exclusive end for all-day
events, so the feed adds exactly one day to `end` while keeping the original
inclusive `startDate`/`endDate` in the payload. Dates stay date-only strings, so
there is no timestamp, timezone or BST shift.

### Frontend

`public/calendar.html` and `public/js/calendar.js` use the vendored
**FullCalendar 5.10.1** directly; the calendar code does not use jQuery (the
rest of AdminLTE still does). The page has:

* month, week and list views, plus a five-item legend;
* a modal for adding/editing HR events, opened by clicking a date or an event;
* a delete button in the edit modal;
* leave events that navigate to `/leaves.html`;
* a responsive switch to list view below 768 px;
* a date-only implementation that avoids browser timezone conversions;
* dark mode through the shared CSS variables.

### Tests

`tests/calendar.test.ts` (9 passing) covers:

* authentication and CSRF on event writes;
* create, update and delete;
* a single-day event defaulting to an inclusive one-day end;
* date-only events across both BST boundaries;
* approved leaves included and pending/rejected leaves excluded;
* overlap filtering and range validation, including the 400-day cap;
* a reversed event range and an unknown type;
* a viewer account being refused.

## 3. Dashboard

### Summary

`GET /api/dashboard/summary` returns today's cards in `APP_TIMEZONE` for
**active employees only**: total, present, late, absent, on leave (`on_leave` +
`vacation`) and not marked yet. The daily-sheet rules are reused, so the card
numbers agree with the sheet.

On a non-working day the API returns `isWorkingDay: false` and no
`notMarked` value; the page shows a notice and hides the “not marked yet” card.
The service accepts an internal date argument so this can be tested without
changing the system clock.

### Year and month series

* `GET /api/dashboard/year?year=YYYY` returns twelve buckets with:
  * Attendance = `present + late`;
  * Absence = `absent`;
  * Leave & vacation = `on_leave + vacation`.
* `GET /api/dashboard/month?month=YYYY-MM` returns one point per day with the
  same three series, plus Top Employees for that month.

The month selector refreshes both the month chart and Top Employees; the year
selector refreshes the twelve-month chart.

### Top Employees and departments

The score is `present × 3 − late × 1 − absent × 2`. Leave and vacation days are
excluded from the aggregation entirely. Only active employees with at least one
counted day are eligible. Ties are broken by:

1. fewer absences;
2. more present days;
3. name.

The response contains only score, present, late and absent counts plus name,
position and department. The aggregation never projects the photo.

Departments are a doughnut and a table of **active** employee counts, both built
from aggregation pipelines using the existing indexes rather than one query per
department.

Charts use **Chart.js 2.9.4** and read their palette from `--hrm-*` CSS
variables. Every chart is destroyed and rebuilt on the `hrm:theme` event, so a
light/dark switch cannot leave an old palette behind. The page uses no inline
scripts, so the existing CSP remains unchanged.

`tests/dashboard.test.ts` (6 passing) checks the card numbers against the daily
sheet, the active-employee restriction, the non-working-day response, the
hand-calculated Top Employees order including ties, the exclusion of leave days,
the twelve month buckets and input validation.

## 4. Reports

`public/reports.html` with `public/js/reports.js` has three tabs:

### Attendance summary

`GET /api/reports/attendance-summary?from=&to=&departmentId=&employeeId=`
returns per-employee present, late, absent, on leave and vacation counts. The
rate is:

```text
(present + late) / (present + late + absent)
```

Leave and vacation days are excluded from the denominator; an employee with no
counted days has a `null` rate. The table is paginated, the totals row covers
the whole filtered set, and the CSV export
(`/api/reports/attendance-summary.csv`) also exports every filtered row, not
just the current page. CSV cells that begin with a formula character are escaped
with a leading apostrophe, the same rule as the other exports.

### Overtime

Reuses `GET /api/overtime/summary` for a month and department, with the existing
summary CSV export.

### Leave activity

Reuses `GET /api/leaves` and `GET /api/employees/:id/leave-totals`. The table
lists the filtered leaves; choosing an employee shows their approved leave
totals by year and type.

Detailed attendance records remain on `/attendance-report.html`; both the
attendance summary and overtime tabs link to their detailed pages. The print
stylesheet expands all three tab panes, so one print job covers the whole
reports page.

`tests/reports.test.ts` (7 passing) covers the counts and rates, leave-excluded
denominator, totals, pagination, department and employee filters, full CSV
export with formula neutralisation, range/filter validation, authentication and
the administrator role.

## 5. Demo data

`npm run seed:demo` is local/demo only. It refuses to run when
`NODE_ENV=production` and refuses a database that already contains employees. It
creates:

* 5 departments;
* 25 fake employees;
* roughly three months of attendance up to yesterday — mostly present, with
  some late, absent and unmarked days;
* 6 approved leaves processed through the real leave reconcile;
* 30 overtime entries;
* 4 calendar events.

The random generator has a fixed seed. The demo seeder does not create an
administrator; use `npm run seed` with the `SEED_ADMIN_*` variables when the
database has no login yet.

Actual run against a dedicated `lean-hrm-demo-3c` database:

```text
departments: 5
employees:   25
attendance:  1433 (2026-07-23 … 2026-10-20)
leave rows:  12 generated by 6 approved leaves
overtime:    30 entries
events:      4
```

The resulting attendance breakdown was 1216 present, 150 late, 67 absent, 7 on
leave and 5 vacation; 12 of the 1445 rows were `leave_sync`, the other 1433
manual. Re-running the seeder against that database refused with “already
contains 25 employee(s)”. The production refusal was also verified.

## 6. Quality and security

* Every new input is validated with zod: calendar query, event body/params,
  dashboard year/month and all report filters.
* Every new route uses `requireAuth` and `requireAdmin`; mutating event routes
  also pass through the global CSRF middleware.
* New tables use `HrmDom.html`, which escapes every interpolated value.
  `innerHTML` is only used with trusted markup generated by that helper.
* Toastr is used for client errors/successes; no inline scripts or event
  handlers were added, and the existing CSP is untouched.
* Tables are wrapped in responsive containers; the calendar switches to list
  view on small screens.
* Dark mode uses the shared CSS variables and was checked on the dashboard,
  calendar and reports pages.
* The README has the new scripts, the leave-year/holiday rules, the resync
  instructions, the three module descriptions, the demo-data warning and the
  expanded API table.

## 7. Verification

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm test` | **155 tests, 22 suites, 155 pass, 0 fail** (96.5 s) |
| `seed:demo` | 5 departments, 25 employees, 1433 manual + 12 leave_sync rows, 30 overtime entries, 4 events |
| Demo refusals | Refused `NODE_ENV=production`; refused a non-empty employee database |
| `resync-leaves` | 4 day counts updated after a `WORKING_WEEK` change; manual rows unchanged; second run idempotent; temporary DB dropped |
| Browser | Headless Chrome via CDP against the demo database on port 3100; no console, CSP or network errors on dashboard/calendar/reports |

### Browser findings

* **Dashboard:** 25 total / 0 present / 0 late / 0 absent / 0 on leave / 25 not
  marked (the demo attendance stops at yesterday by design); 5 Top Employees,
  5 department rows and 3 Chart.js instances. Switching light → dark changed the
  chart legend/tick colours from `#212529`/`#6c757d` to `#e6e8ea`/`#9aa0a6`,
  proving the charts were rebuilt.
* **Calendar:** October 2026 showed 7 events (4 HR, 3 leave), 5 legend items,
  and working month/week/list views. A real mouse click on 22 October opened
  “Add event” with `2026-10-22` in both date fields. Clicking “Company holiday”
  opened “Edit event” with the delete button visible. Clicking a leave event
  navigated to `/leaves.html`. At 390 px the calendar switched to `.fc-list`
  with no horizontal overflow.
* **Reports:** 25 attendance rows and totals of 259 present, 35 late, 15 absent,
  2 on leave, 0 vacation, 95.1% (the totals row). October overtime showed 1
  employee / 2 entries / 6 hours — the demo seed simply placed two October
  entries with the same employee. The leave tab showed 6 rows and yearly totals
  for the selected employee. Print emulation expanded all three panes to
  `display: block`. At 390 px the page had no horizontal overflow and four
  responsive table wrappers.
* Screenshots and the machine-readable result were kept in the local
  verification temp directory and are not part of the repository.

### Not verified / limitations

* Browser checks used headless Chrome with viewport emulation, not a physical
  phone or a second browser (Safari/Firefox).
* The calendar and reports CRUD paths were exercised by the API test suites;
  in the browser I opened the add/edit modals and verified their fields, but did
  not create and delete an event through the UI end to end.
* The non-working-day card behaviour is covered by the dashboard test using the
  service date argument; the browser run was on a working Wednesday.
* All runtime data came from the demo database. No production database or
  production environment was touched.
* There is no `npm run build` in this multi-page Express project; `typecheck`
  and the tests are the available static/runtime checks.
