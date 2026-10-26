# Phase 1 — Audit Report: Laravel → Lean HR (Node/Express/MongoDB)

**Repo:** `hr-management-system-hrm`
**Branch:** `rebuild/lean-hrm` (created, based on `master` @ `6c9e752`)
**Status:** Audit only. No Laravel/PHP/Blade file has been modified, moved or deleted.
**Scope of this document:** module inventory, UI inventory, schema mapping, risks, open questions.

---

## 1. Current stack (as found)

### Backend
| Item | Value | Evidence |
|---|---|---|
| Framework | Laravel 10.10, PHP ^8.1 | `composer.json` |
| DB | MySQL (`DB_CONNECTION=mysql`) | `config/database.php:18`, `.env.example` |
| Auth | Laravel `Auth::attempt` + `is_role` flag on `users` | `app/Http/Controllers/AuthController.php:87-100` |
| Auth guard | `admin` middleware alias → `AdminMiddleware` | `app/Http/Kernel.php:88`, `app/Http/Middleware/AdminMiddleware.php` |
| PDF | `barryvdh/laravel-dompdf` ^3.0 | `composer.json` |
| Excel | `maatwebsite/excel` ^3.1 | `composer.json`, `app/Exports/*` |
| API | Sanctum, 1 stub route only (`GET /api/user`) | `routes/api.php`, `routes/web.php` |
| Mail | SMTP + `ForgotPasswordMail` | `app/Mail/ForgotPasswordMail.php` |
| Other | broadcasting, queues, cache, redis, sanctum, mail configs | `config/*` |

### Frontend — the design system is **AdminLTE 3.2.0** (Bootstrap 4), fully vendored
| Library | Version | Location |
|---|---|---|
| AdminLTE | 3.2.0 | `public/dist/css/adminlte.min.css`, `public/dist/js/adminlte.js` |
| Bootstrap | 4.6.1 | `public/plugins/bootstrap/` |
| jQuery | 3.6.0 | `public/plugins/jquery/` |
| Chart.js | **2.9.4** | `public/plugins/chart.js/Chart.min.js` (also loaded from CDN in views) |
| FullCalendar | **5.10.1** (vanilla, no jQuery) | `public/plugins/fullcalendar/main.min.js` |
| Font Awesome Free | 5.x (`fa fa-`, `fas fa-`) | `public/plugins/fontawesome-free/` |
| Others | Select2, iCheck, Moment, daterangepicker, Tempusdominus, Toastr, SweetAlert2, DataTables(+buttons/responsive), jsPDF/pdfmake, overlayScrollbars, PACE, Sparklines, jQuery-knob, Summernote, jqvmap, jsgrid, datemask, ion-range | `public/plugins/*` |

**Important finding:** `package.json` declares Vue 3 + `@vitejs/plugin-vue` + `laravel-vite-plugin` + Bootstrap 5 + FullCalendar 6, and `vite.config.js` is wired up — **but the running UI does not use Vite at all.** Every Blade view loads the vendored AdminLTE/Bootstrap-4 files from `public/`. The Vue code is dead scaffold:
- `resources/js/app.js` (mounts an empty Vue app), `resources/js/components/ExampleComponent.vue`, `resources/js/bootstrap.js`
- `resources/css/app.css` (empty), `resources/sass/app.scss`, `resources/sass/_variables.scss`
- `public/build/**` (stale AdminLTE source build output)

So the *real* reference design = AdminLTE 3.2.0 + Bootstrap 4 + Font Awesome 5 + Chart.js 2, plus one custom dark-mode layer (`public/dist/css/darkmode.css`) and a custom calendar CSS (`public/dist/css/calender.css`).

---

## 2. Module inventory — KEEP / MODIFY / REMOVE

### 2.1 Authentication & admins
| Module | Files | Verdict |
|---|---|---|
| Login page | `resources/views/login.blade.php` (121 ln), `app/Http/Controllers/AuthController.php:20-22,87-100`, `routes/web.php:33,37` | **KEEP** → becomes `POST /api/auth/login` + `GET /login.html`. Visual design (blurred bg `public/dist/css/mina.css` + `bc4.jpg`) carried over. |
| Logout | `AuthController.php:102-105`, `routes/web.php:47` | **MODIFY** → `POST /api/auth/logout` (session destroy) |
| Public registration | `routes/web.php:35-36`, `AuthController.php:58-84`, `resources/views/register.blade.php`, `resources/views/auth/register.blade.php` | **REMOVE** (spec: no registration page) |
| Laravel auth scaffolding | `app/Http/Controllers/Auth/{LoginController,RegisterController,ConfirmPasswordController,ResetPasswordController,VerificationController}.php`, `resources/views/auth/**`, `app/Mail/ForgotPasswordMail.php`, `resources/views/emails/forgot_password.blade.php`, `AuthController::forgot_password*` (references a **non-existent** `forgot_password` view — currently a 500 if hit) | **REMOVE** |
| Password reset tables | `database/migrations/2014_10_12_100000_create_password_resets_table.php`, `..._password_reset_tokens_table.php` | **REMOVE** |
| Role guard | `app/Http/Middleware/AdminMiddleware.php`, `app/Http/Kernel.php:88` | **MODIFY** → `requireAuth` + `requireAdmin` Express middleware |
| Admins management | **does not exist today** (admins are `users` rows with `is_role=1`) | **ADD** → new `admins` collection + "Admins/Settings" page (list, add, edit, deactivate, change own password) |
| "My Account" | `routes/web.php:97-98`, `app/Http/Controllers/MyAccountController.php`, `resources/views/backend/my-account/update.blade.php` | **MODIFY** → merge into Admins/Settings |

### 2.2 Dashboard & charts
| Module | Files | Verdict |
|---|---|---|
| Dashboard page | `routes/web.php:41`, `app/Http/Controllers/DashboardController.php`, `resources/views/backend/dashboard/list.blade.php`, `public/dist/js/dashboardlist.js` | **MODIFY** — 4 `small-box` cards + monthly bar chart. Add month selector, "On Leave Today" card, top-employees list, departments headcount. Existing chart is hardcoded to the current year / 12 months (`DashboardController.php:46-66`) and divides present count by 4 (`/4` at line 65) — a bug we replace. |
| Charts page | `routes/web.php:49`, `app/Http/Controllers/ChartsController.php`, `resources/views/backend/dashboard/charts.blade.php`, `public/dist/js/charts.js` | **MODIFY** → merge into Dashboard. Pie chart (departments overview) and bar chart reused; "Top Employees" is currently ranked by **overtime hours** (`ChartsController.php:42-53`) but the spec wants ranking by **attendance/punctuality**. |
| Calendar page | `routes/web.php:48`, `app/Http/Controllers/CalendarController.php`, `resources/views/backend/dashboard/calender.blade.php`, `public/dist/css/calender.css` | **MODIFY** → real calendar fed by `events` + `leaves`. Today the events are a **hardcoded array** in `CalendarController.php:33-47` and the view renders a hand-built `<table>`; FullCalendar 5.10.1 is already vendored but unused. |
| ToDo list | `routes/web.php:52-56`, `app/Http/Controllers/TodoController.php`, `resources/views/backend/dashboard/ToDo.blade.php`, `public/dist/js/todo.js`, `app/Models/Task.php`, migration `2024_08_00_todolist_create_tasks_table.php` | **REMOVE** (tasks/projects) |

### 2.3 Employees & departments
| Module | Files | Verdict |
|---|---|---|
| Employee list | `routes/web.php:60-68`, `app/Http/Controllers/EmployeeeController.php`, `resources/views/backend/employees/list.blade.php`, `app/Models/User.php::getRecord()` | **MODIFY** — add status (active/inactive), photo, position; soft-deactivate instead of hard delete; server-side pagination + search (currently `paginate(5)` inside the model). |
| Employee add/edit/view | `resources/views/backend/employees/add.blade.php`, `edit.blade.php`, `view.blade.php` | **MODIFY** — `add.blade.php` has a **required `salary` field** (line 109-115) → removed. `view.blade.php` is a read-only form with no attendance/leave history → becomes a real profile page. |
| Employee `new.blade.php` | `resources/views/backend/employees/new.blade.php` (1464 ln) | **REMOVE** — unrouted, unused AdminLTE *DataTables demo* page. |
| Employee `info.blade.php`, `temp.blade.php` | `resources/views/backend/employees/` | **REMOVE** — unrouted leftovers. |
| Department CRUD | `routes/web.php:112-121`, `app/Http/Controllers/DepartmentController.php`, `resources/views/backend/departments/{list,add,edit,info}.blade.php` | **MODIFY** — `manager_id` FK → `managers` table is being removed; drop manager FK (or keep as free-text). Add **employee-count column** (currently only computed inside `ChartsController`). `department_export` (maatwebsite/excel) → **CSV**. |
| Managers | `routes/web.php:101-109`, `app/Http/Controllers/ManagerController.php`, `app/Models/Manager.php`, `resources/views/backend/managers/*` | **REMOVE** (managers table carries `salary`, `commission_pct` = payroll) |
| Jobs (Current + History) | `routes/web.php:76-94`, `JobController`, `JobHistoryController`, `app/Models/Job.php`, `History.php`, `resources/views/backend/jobss/*`, `backend/job-history/*`, `app/Exports/JobsExport.php`, `JobhistoryExport.php` | **REMOVE** — tables carry `min_salary`/`max_salary` = payroll. The spec's "position" becomes a plain string field on the employee. |

### 2.4 Attendance
| Module | Files | Verdict |
|---|---|---|
| Daily sheet | `routes/web.php:124-125`, `AttendanceController::AttendanceEmployee/AttendanceEmployeeSubmit`, `resources/views/backend/attendance/employee.blade.php`, `public/dist/js/attendance.js` | **MODIFY** — currently radios only (Present/Late/Absent/**Half Day**). Spec wants **Present/Late/Absent/On Leave/Vacation** + check-in/out times + notes. Currently saves one row per (employee,date) via an app-level "check if exists" query — **no DB unique constraint**. Feedback uses `alert()` → toast. |
| Attendance report | `routes/web.php:127`, `AttendanceController::index`, `app/Models/Attendance.php::getRecord()`, `resources/views/backend/attendance/report.blade.php` | **MODIFY** — filters today: name, type, start_date, end_date. Spec adds **department** filter + **CSV export**. |
| Attendance PDF | `routes/web.php:128`, `AttendanceController::exportPdf`, `resources/views/backend/attendance/pdf.blade.php`, `barryvdh/laravel-dompdf` | **REMOVE** (spec asks for CSV; dompdf dropped with the PHP stack) |
| Attendance table | migration `2024_08_00_06_create_attendances_table.php` (`attendance_date`, `employee_id`, `attendance_type`, `created_by`) | **MODIFY** → add `check_in`, `check_out`, `note`, `updated_by`, unique index |

### 2.5 Overtime
| Module | Files | Verdict |
|---|---|---|
| Overtime list/add | `routes/web.php:148-152`, `app/Http/Controllers/OverTimeController.php`, `resources/views/backend/bounas/{list,add}.blade.php`, `public/dist/js/bounas.js`, `app/Models/Time.php` | **MODIFY** — the date is smuggled through **`created_at`** (`OverTimeController.php:44`, `bounas/list.blade.php:89`) → must become a real `date` field. No edit, no monthly summary, no CSV → add. Route/folder names `bounas` (bonus) → renamed **Overtime**. Money/bonus → removed. |
| Overtime table | migration `2024_08_00_09_create_times_table.php` (`employee_id`, `hours`) | **MODIFY** → add `date`, `note`, `created_by`, `updated_by` |

### 2.6 Leave & vacation
| Module | Files | Verdict |
|---|---|---|
| Leave Excuses | `routes/web.php:132-136`, `app/Http/Controllers/leaveController.php`, `app/Models/Leave.php`, `resources/views/backend/leaves/{index,add}.blade.php`, `public/dist/js/leave.js` | **MODIFY** → merge with vacations into one **Leave & Vacation** module. Current fields are `employee_id`, `leave_type` (Early/Casual), `leave_deduction` (money, "LE"), `created_at` (used as the leave date!). Missing: date **range**, reason, **status**, totals, auto-sync to attendance. |
| Vacations | `routes/web.php:140-144`, `app/Http/Controllers/VacationController.php`, `app/Models/Vacation.php`, `resources/views/backend/vacations/{index,add}.blade.php`, `public/dist/js/vacation.js` | **MODIFY** → merged into `leaves` collection with `type: 'vacation'`. `total` days is computed in `VacationController.php:37-40` (keep). |
| Leave/Vacation tables | migrations `2024_08_00_07_create_leaves_table.php`, `2024_08_00_08_create_vacations_table.php` | **MODIFY** → single `leaves` collection |

### 2.7 Payroll (and everything else)
| Module | Files | Verdict |
|---|---|---|
| Payroll | `routes/web.php:156-164`, `app/Http/Controllers/PayrollController.php` (237 ln — computes deductions per attendance type, vacation deduction at 200/LE, bonus at 50/hour, tax = salary/10, net pay), `app/Models/Payroll.php`, `app/Exports/PayrollExport.php`, `resources/views/backend/payrolls/{index,create,edit,pdf}.blade.php`, migration `2024_08_00_10_create_payrolls_table.php` | **REMOVE** |
| Salary fields | `users.salary`, `users.commission_pct` (migration `2024_08_00_04`), `jobs.min_salary`/`max_salary`, `managers.salary`/`commission_pct` | **REMOVE** |
| Multi-tenant / other | `config/{broadcasting,sanctum,mail,queue,cache,services}.php`, `app/Http/Controllers/HomeController.php`, `app/Providers/{BroadcastServiceProvider,EventServiceProvider}.php` | **REMOVE** |
| ZKTeco device service | `app/Services/ZKTecoService.php` — hardcoded `192.168.1.201:4370`, and `ZKLib` is **not even in `composer.json`** (dead, broken code) | **REMOVE** (spec = manual attendance only) |
| Laravel test scaffolding | `tests/Feature/ExampleTest.php`, `tests/Unit/ExampleTest.php`, `tests/CreatesApplication.php`, `phpunit.xml` | **REPLACE** with API tests (auth, attendance, leave sync) |
| Vite/Vue scaffold | `package.json`, `vite.config.js`, `resources/js/**`, `resources/css/app.css`, `resources/sass/**`, `public/build/**`, `resources/js/components/ExampleComponent.vue` | **REMOVE** (replaced by the new Node build) |

**Not present anywhere in this codebase** (nothing to remove): recruitment, projects, chat, assets, training, performance reviews, expenses, announcements, documents, multi-tenant, employee portal. The spec's remove-list is already satisfied except for the modules listed above.

---

## 3. UI pieces to carry over

### 3.1 Layout / shell
| Piece | Current location | New location |
|---|---|---|
| AdminLTE 3.2.0 shell CSS + JS (sidebar, navbar, card, small-box, info-box, table, form, pagination, modal, btn variants) | `public/dist/css/adminlte.min.css`, `public/dist/js/adminlte.js` | `public/vendor/adminlte/` |
| Font Awesome 5 icons | `public/plugins/fontawesome-free/` | `public/vendor/fontawesome/` |
| Bootstrap 4.6.1 grid + components (needed by AdminLTE) | `public/plugins/bootstrap/` | `public/vendor/bootstrap/` |
| jQuery 3.6 (AdminLTE 3 dependency) | `public/plugins/jquery/jquery.min.js` | `public/vendor/jquery/` |
| Source Sans Pro webfont | Google Fonts `<link>` in `backend/layouts/app.blade.php:14-16` | keep (or self-host for Render) |
| Sidebar markup (brand block, user panel, nav pills, nav-header separators, active-state logic via `Request::segment(2)`) | `resources/views/backend/layouts/_sidebar.blade.php:84-259` | `public/partials/sidebar.html` (static HTML, `data-page` attribute for active state) |
| Top navbar (pushmenu toggle, dark-mode moon, calendar, charts, todo, fullscreen, logout) | `_sidebar.blade.php:13-80` | `public/partials/navbar.html` (todo/charts entries removed) |
| Page header + breadcrumb block | duplicated in every view (`.content-header`) | `public/partials/page-header.html` |
| Card "glass" look — inline style repeated on ~25 cards: `background-color: rgba(255,255,255,0.9); border-radius:8px; box-shadow:0 4px 8px rgba(0,0,0,0.1)` | inline in every `resources/views/backend/**/*.blade.php` | one CSS class `.card-glass` in `public/css/theme.css` |
| Flash message block (success/error alert) | `resources/views/_message.blade.php` | `public/partials/flash.html` + toastr |
| Login screen + blurred background | `resources/views/login.blade.php`, `public/dist/css/mina.css`, `public/dist/img/bc4.jpg` | `public/login.html`, `public/assets/img/bc4.jpg` |
| Per-page background images | `public/dist/img/{dashboard.jpg, attendance.png, generall.png, leave.jpg, overtime.jpg, vacation.jpg}` | `public/assets/img/*` (see perf risk) |
| Logo + admin avatar | `public/dist/img/hr_logo-.png`, `admin.jpg` | `public/assets/img/*` |

### 3.2 Components
| Piece | Current location | Notes |
|---|---|---|
| Stat / summary cards (`small-box bg-info/success/warning/danger` + icon) | `resources/views/backend/dashboard/list.blade.php:30-79` | 4 cards today (Employees / Present / Late / Absent). Spec adds **On Leave Today**. "Late" card currently = `lateCount + halfdayCount`. |
| Info-box counters | `resources/views/backend/dashboard/charts.blade.php:29-64` | Employees / Managers / Jobs / Departments → Departments stays, Managers+Jobs drop, Departments added. |
| Card-with-outline chart frame (`card card-outline card-primary`, header colour `rgb(93,93,255)`) | `list.blade.php:85-96`, `charts.blade.php:73-101` | reuse verbatim |
| Monthly performance bar chart (Present / Absent / Vacations) | `public/dist/js/dashboardlist.js` + `list.blade.php:107-114` | Chart.js 2.9.4, palette `rgba(75,192,192)`, `rgba(255,99,132)`, `rgba(60,141,188)`. Add month selector. |
| Departments pie chart | `public/dist/js/charts.js:1-26` | palette `['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF']` |
| Top-employees bar chart | `public/dist/js/charts.js:27-82` | re-point at attendance ranking instead of overtime |
| DataTables list styling | `resources/views/backend/employees/new.blade.php` (unrouted demo) | styling only; we implement server-side pagination instead |
| List + search-card pattern (search form card above list card) | `employees/list.blade.php`, `departments/list.blade.php`, `leaves/index.blade.php`, `vacations/index.blade.php`, `bounas/list.blade.php`, `attendance/report.blade.php` | one shared partial + one shared JS module |
| Button colour roles | across views | `btn-primary` = Save/Search/Add, `btn-success` = Reset, `btn-danger` = Delete, `btn-info` = View, `btn-default` = Back |
| Table style | `.table.table-striped` + `card-body.p-0` | keep, add horizontal-scroll wrapper + card-collapse on mobile |
| Pagination markup (Laravel Bootstrap-4 pagination) | `$getRecord->links()` in list views | reimplement in vanilla JS (same look) |
| Form layout | `form.form-horizontal` + `form-group row` + `col-sm-2 col-form-label` / `col-sm-10` | keep (AdminLTE/Bootstrap classes) |
| Calendar grid CSS (`.empty`, `.weekend`, `.event`, `.current` + dark variants) | `public/dist/css/calender.css` | superseded by FullCalendar 5.10.1, but colours reused as event colours |
| Select2 dropdowns | `public/plugins/select2` | keep for employee/department pickers |
| Date range picker for report filters | `public/plugins/moment` + `daterangepicker` | keep |
| Toastr notifications | `public/plugins/toastr` | replace the `alert()` calls in `attendance.js`, `leave.js`, `vacation.js`, `bounas.js` |
| Icons used in nav | `fa fa-tachometer-alt`, `fa fa-users`, `fa fa-building`, `fa fa-calendar-alt`, `fa fa-file-alt`, `fa fa-clock`, `fa fa-umbrella-beach`, `fa fa-coins`(→drop), `fa fa-cog`, `fa fa-sign-out-alt` | reuse |

### 3.3 Dark mode
| Current | New |
|---|---|
| `public/dist/css/darkmode.css` (209 ln) — `body.dark-mode` class, hard-coded hex overrides for body, tables, navbar, forms, cards, buttons. Does **not** respect `prefers-color-scheme`, does **not** persist on first load, and `.content-wrapper::before` overlay is hardcoded `rgba(0,0,0,.7)` | rewritten as `public/css/theme.css` using **CSS custom properties** (`--bg`, `--surface`, `--text`, `--border`, `--primary`, …) with `[data-theme="dark"]` overrides |
| `public/dist/js/darkmode.js` (20 ln) — toggles `body.dark-mode`, saves `localStorage.theme` | `public/js/theme.js` — reads `localStorage.theme`, else `matchMedia('(prefers-color-scheme: dark)')`, writes `data-theme` on `<html>`; charts re-read theme colours on change |

### 3.4 Fullscreen
Current: AdminLTE's `data-widget="fullscreen"` button (`_sidebar.blade.php:63-66`) → uses AdminLTE's Fullscreen plugin, which calls the Fullscreen API but has **no state persistence and no icon swap**. New: own handler using the **Fullscreen API** (`requestFullscreen`/`exitFullscreen`) with icon swap + `fullscreenchange` listener.

---

## 4. Database schema → MongoDB collections

### `admins`  *(from `users` where `is_role = 1`)*
```
_id            ObjectId          ← users.id
name          String            required
email         String            required, unique, lowercase, trim
password      String            bcrypt hash (12 rounds)
isActive      Boolean           default true        ← NEW (deactivate admins)
role          String            default "admin"
lastLoginAt   Date | null       ← NEW
createdAt / updatedAt          Date
```
Indexes: `{ email: 1 }` unique.

### `employees`  *(from `users` where `is_role = 0`)*
```
_id            ObjectId
name          String            required
email         String | null                    (contact only — employees never log in)
phone         String
photo         { data: String(base64), mime: String, size: Number }   ← NEW
departmentId  ObjectId          ref departments
position      String            ← replaces jobs.job_title
hireDate      Date
status        String  enum: active | inactive | terminated     ← NEW
createdAt / updatedAt          Date
```
Indexes: `{ status: 1 }`, `{ departmentId: 1 }`, `{ name: 1 }` (regex-searchable prefix), `{ email: 1 }` sparse.

### `departments`  *(from `departments`)*
```
_id            ObjectId
name          String            required, unique      ← was department_name
location      String
description   String            ← optional extra
createdAt / updatedAt          Date
```
Employee count is computed via aggregation (no denormalised counter → no drift).

### `attendance`  *(from `attendances`)*
```
_id            ObjectId
employeeId    ObjectId          required, ref employees
date          Date              required, normalised to local midnight
status        String  enum: present | late | absent | on_leave | vacation
checkIn       Date | null
checkOut      Date | null       ← NEW
note          String            ← NEW
source        String  enum: manual | leave_sync   ← NEW
createdBy     ObjectId          ref admins     (already existed)
updatedBy     ObjectId          ref admins     ← NEW
createdAt / updatedAt          Date
```
Indexes: **`{ employeeId: 1, date: 1 }` UNIQUE** (the spec's requirement), `{ date: 1 }`, `{ date: 1, status: 1 }` (dashboard aggregation).

### `overtime`  *(from `times`)*
```
_id            ObjectId
employeeId    ObjectId          required
date          Date              required          ← NEW (was smuggled in created_at)
hours         Number            required, 0.25–24
note          String            ← NEW
createdBy / updatedBy         ObjectId  ref admins
createdAt / updatedAt          Date
```
Indexes: `{ employeeId: 1, date: 1 }`, `{ date: 1 }`.

### `leaves`  *(merges `leaves` + `vacations`)*
```
_id            ObjectId
employeeId    ObjectId          required
type          String  enum: leave | vacation | time_off
category      String            (casual | sick | early | annual | unpaid | ...)
startDate     Date              required
endDate       Date              required, >= startDate
days          Number            computed (inclusive)
reason        String
status        String  enum: pending | approved | rejected     ← NEW
decidedBy     ObjectId | null   ref admins                      ← NEW
decidedAt     Date | null
createdBy     ObjectId          ref admins
createdAt / updatedAt          Date
```
Indexes: `{ employeeId: 1, startDate: 1 }`, `{ status: 1 }`, `{ startDate: 1, endDate: 1 }`.

### `events`  *(NEW — replaces the hardcoded array in `CalendarController.php:33-47`)*
```
_id            ObjectId
title         String            required
description   String
type          String  enum: holiday | deadline | meeting | event | leave | vacation
startDate     Date              required
endDate       Date | null       (null = single-day / all-day)
allDay        Boolean           default true
employeeId    ObjectId | null   (optional link to a leave)
color         String | null     (optional override)
createdBy     ObjectId          ref admins
createdAt / updatedAt          Date
```
Indexes: `{ startDate: 1 }`, `{ type: 1 }`.

### `sessions` (connect-mongo)
Auto-managed by `connect-mongo`. TTL index on `expires`.

### Collections dropped
`users` (split into `admins` + `employees`), `managers`, `jobs`, `histories`, `payrolls`, `tasks`, `password_resets`, `password_reset_tokens`, `personal_access_tokens`, `failed_jobs`.

---

## 5. Proposed new project structure

```
/public
  index.html (SPA shell)  login.html  offline.html
  css/  theme.css  app.css  vendor/
  js/   api.js  app.js  theme.js  layout.js  dashboard.js  employees.js
        departments.js  attendance.js  overtime.js  leaves.js  calendar.js  reports.js
  partials/  sidebar.html  navbar.html  page-header.html  modal.html  flash.html
  vendor/  adminlte/  bootstrap/  jquery/  fontawesome/  chartjs/  fullcalendar/
            select2/  moment/  daterangepicker/  toastr/
  assets/img/  (optimised copies of the current background images + logo)
/src
  config/    env.js  db.js  session.js
  models/    Admin.js  Employee.js  Department.js  Attendance.js  Overtime.js  Leave.js  Event.js
  routes/    auth.js  employees.js  departments.js  attendance.js  overtime.js
             leaves.js  events.js  reports.js  dashboard.js
  controllers/  (one per route module)
  middleware/   requireAuth.js  requireAdmin.js  validate.js  errorHandler.js  rateLimit.js
  services/  attendanceSync.js  dashboardStats.js  csv.js  pagination.js
  utils/     dates.js  csv.js  response.js  validators.js
/seed         seed.js
server.js  .env.example  render.yaml  README.md
tests/       auth.test.js  attendance.test.js  leave-sync.test.js
```

---

## 6. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **AdminLTE is jQuery + Bootstrap 4.** The brief says "no CSS framework *unless the existing UI already uses one*" — the existing UI *is* AdminLTE/Bootstrap 4, so keeping it is legal and is the only way to guarantee "preserve the look and feel". Rewriting it by hand risks visible drift. | High | **Recommended:** keep AdminLTE 3.2.0 + Bootstrap 4 + FA5 vendored (no build step), and write all *new* code in plain vanilla JS with zero new jQuery. Alternative = hand-rolled CSS (see Open Question Q1). |
| R2 | Blade → vanilla HTML means re-implementing Laravel conveniences: CSRF token, `old()` repopulation, `Request::get()` filters, session flash, Laravel pagination HTML, `assets()`/`url()`. | Medium | New API returns `{ success, data, meta, errors }`; a tiny `api.js` wrapper + `form.js` helper for repopulation; CSRF double-submit token issued at login and echoed in `X-CSRF-Token`; custom pagination partial styled like Bootstrap 4. |
| R3 | **Chart.js is v2.9.4** (2021, deprecated). v2 works standalone but has no TS/types and no modern tree-shaking; v4 changed the API (`Chart` global → `chart.js/auto`, scales API). | Medium | Keep the vendored v2.9.4 for a pixel-identical look, or upgrade to Chart.js v4 in `/public/vendor` (colour/typography preserved by hand). Decision needed (Q4). |
| R4 | **FullCalendar 5.10.1** is already vendored (vanilla, no jQuery) and supports dark mode via CSS vars. It is *unused* today. | Low | Reuse the vendored v5.10.1 → zero new dependency, already offline-capable. |
| R5 | **Employee photos don't exist at all today** and Render's filesystem is ephemeral. | Medium | Recommended: **base64 data URL inside the employee document**, capped at ~256 KB (≈ 1920px JPEG/WebP). Atlas M0 allows 16 MB per document, so this fits easily and needs no extra service. GridFS is the fallback if you expect bigger/more images. **Decision needed (Q2).** |
| R6 | **Leave → attendance auto-sync conflicts with the unique index.** If an admin manually marks *Present* on a day with an approved leave, and the leave is later synced, one of them must win. | High | Policy proposed: **manual record always wins**; sync only writes where no record exists (`source: 'leave_sync'`). Sync runs on leave create/update/approve/delete and is idempotent. **Confirm (Q3).** |
| R7 | **"Top Employees" ranking formula is undefined.** Current chart ranks by overtime hours; spec says attendance/punctuality. | Medium | Proposed score = `present*2 + on_time*1 − late − absent` (i.e. attendance rate weighted by punctuality), computed with a Mongo aggregation. **Confirm (Q5).** |
| R8 | **Admin self-management foot-guns.** Any admin can deactivate other admins; a careless click could lock everyone out. | High | Enforce: cannot deactivate **yourself**; cannot deactivate the **last active admin**; deactivating an admin invalidates their sessions immediately (sessions store adminId → check `isActive` per request). |
| R9 | **Background images are huge**: `attendance.png` 16 MB, `bc4.jpg` 7.8 MB, `jobs.jpg` 4.2 MB, `boxed-bg.jpg` 123 KB, `overtime.jpg` 1.4 MB, `generall.png` 1.3 MB. Total ≈ 31 MB of images. | Medium | Re-encode to WebP/JPEG ≤ 150 KB each and keep only the ones still used. |
| R10 | **`public/plugins/` is ~64 MB of unused libraries** (jqvmap, jsgrid, summernote, codemirror, dropzone, raphael, flot, pace, ion-range, daterangepicker locale sets, etc.) | Low | Copy only the needed subset into `/public/vendor`; the rest goes to `/legacy` or is deleted. |
| R11 | **`created_at` is overloaded as a business date** in `times` (overtime), `leaves` (leave date) and `tasks`. | Medium | Every new record gets a real `date`/`startDate` field; `createdAt` stays a system timestamp only. |
| R12 | **No data migration plan.** The MySQL data (if any real data exists) is not covered. | Low | Assume seeded demo data only. If real data exists, a one-off `php artisan` export → JSON → import script is needed. **Confirm (Q6).** |
| R13 | **Render free-tier constraints**: web services sleep after 15 min idle; Atlas M0 has no backups and a shared cluster. | Low | `/health` endpoint + `autoDeploy: true`; note sleep behaviour in README. |
| R14 | Existing `Attendance::getRecord()` and `User::getRecord()` put SQL **inside the model**, use `Request::get()` statics, and several queries are unfiltered `LIKE` on un-indexed columns. | Low | New code: query builders in controllers, zod validation, real indexes, aggregated counts. |
| R15 | **SQL-injection / XSS in the old code** (e.g. `LIKE` with raw `Request::get()` — Laravel binds these, so not injectable, but Blade `{{ }}` escaping is inconsistent with `{!! !!}` in `pdf.blade.php`). | Low | New code: zod validation on every input, HTML-escaped rendering in the client (`textContent`/`escapeHtml` helper, never `innerHTML` with user data). |

---

## 7. Decisions

### 7.1 Confirmed by the project owner ✅

| # | Question | **Decision** | Impact on the build |
|---|---|---|---|
| **Q1** | AdminLTE/Bootstrap 4 — keep or hand-write CSS? | **Keep AdminLTE 3.2.0** | Vendor `adminlte` + `bootstrap` + `jquery` + `fontawesome` into `/public/vendor`. All *new* code is plain vanilla JS with zero new jQuery. |
| **Q2** | Employee photo storage | **Base64 in the employee document** | `photo: { data, mime, size }`, hard cap **256 KB**, server-side size + mime validation, client-side downscale before upload. |
| **Q3** | Leave → attendance sync vs manual record | **Manual wins** | Sync creates a record only when none exists for (employeeId, date), with `source: 'leave_sync'`. Never overwrites a manual entry. Idempotent; re-runs on leave create/edit/approve/reject/delete. |
| **Q4** | "Top Employees" ranking formula | **Weighted score** | `score = present*2 + on_time*1 − late − absent`, computed with a Mongo aggregation. |
| **Q5** | Attendance status enum | **5 statuses, Half Day dropped** | `present` \| `late` \| `absent` \| `on_leave` \| `vacation`. "Late" card counts `late` only. |

### 7.2 Defaults to be applied unless overridden ⏳

| # | Item | Default to apply |
|---|---|---|
| **Q6** | Existing MySQL data migration | Assume **seeded demo data only** — no migration script. (Say the word if real data exists.) |
| **Q7** | Chart.js version | Keep the vendored **v2.9.4** for identical rendering. |
| **Q8** | Export format | **CSV only**; the old dompdf PDF export is dropped. |
| **Q9** | Auth mechanism | **connect-mongo session cookie** — httpOnly, `secure` in production, `SameSite=Lax`. Sessions survive Render restarts and are revocable the moment an admin is deactivated. |
| **Q10** | Employee `email` | **Optional**, unique when present (contact field only — employees never log in). |
| **Q11** | `/legacy` contents | Move the **source only** (`app/`, `routes/`, `resources/`, `database/`, `config/`, `tests/`, `public/`, `artisan`, `composer.*`, `phpunit.xml`, `vite.config.js`). Drop `vendor/`, `node_modules/`, `public/build`. Old git history stays intact. |
| **Q12** | CSRF protection | **Double-submit token**: issued at login, returned by `GET /api/auth/me`, echoed in the `X-CSRF-Token` header, compared against the session value server-side. |
| **Q13** | Admin safety rails | An admin **cannot** deactivate themselves, and **cannot deactivate the last active admin**. Deactivating an admin invalidates their sessions immediately (`isActive` checked per request). |

---

## 8. Phase 1 completion checklist
- [x] Branch `rebuild/lean-hrm` created (nothing deleted, nothing moved)
- [x] All routes scanned (`routes/web.php`, `routes/api.php`)
- [x] All controllers scanned (17 files)
- [x] All models scanned (12 files)
- [x] All migrations scanned (14 files → 9 app tables + 5 framework tables)
- [x] All seeders + factories scanned (5 seeders, 4 factories)
- [x] All Blade views scanned (62 files) + layout/sidebar
- [x] All custom CSS/JS assets scanned (`public/dist/css/darkmode.css`, `calender.css`, `mina.css`, `payrollcreate.css`; `public/dist/js/{darkmode,charts,dashboardlist,attendance,leave,vacation,bounas,todo,payroll}.js`)
- [x] Vendored plugin library inventory + versions
- [x] Schema → MongoDB collection mapping
- [x] Risks + open questions
- [x] Owner decisions recorded (Q1–Q5 confirmed, Q6–Q13 defaulted)

**Phase 1 status: audit delivered, decisions locked, awaiting go-ahead for Phase 2.**
