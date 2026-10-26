/**
 * The static HTML pages of the app.
 *
 * The app is a multi-page site: one file per module. This list is the
 * allowlist used by the server, so a page that is not listed here is never
 * served.
 */
export interface PageDefinition {
  /** URL segment, e.g. `employees` -> `/employees.html`. */
  slug: string;
  /** File name inside `public/`. */
  file: string;
  /** Human readable title used by the page header. */
  title: string;
  /** Icon used by the sidebar (Font Awesome class). */
  icon: string;
  /** Group heading in the sidebar. */
  section: string;
  /** Public pages are served without a session (login, password reset). */
  public?: boolean;
  /** Extra headers for this page. */
  headers?: Record<string, string>;
}

export const PAGES: PageDefinition[] = [
  { slug: 'dashboard', file: 'dashboard.html', title: 'Dashboard', icon: 'fa fa-tachometer-alt', section: 'Main Information' },
  { slug: 'entries', file: 'entries.html', title: 'Entries', icon: 'fa fa-clipboard-check', section: 'Care Attendance' },
  { slug: 'locations', file: 'locations.html', title: 'Locations', icon: 'fa fa-map-marker-alt', section: 'Care Attendance' },
  { slug: 'employees', file: 'employees.html', title: 'Employees', icon: 'fa fa-users', section: 'Main Information' },
  { slug: 'employee', file: 'employee.html', title: 'Employee Profile', icon: 'fa fa-user', section: 'Main Information' },
  { slug: 'departments', file: 'departments.html', title: 'Departments', icon: 'fa fa-building', section: 'Main Information' },
  { slug: 'attendance', file: 'attendance.html', title: 'Attendance Manually', icon: 'fa fa-calendar-alt', section: 'Attendance & Time' },
  { slug: 'attendance-report', file: 'attendance-report.html', title: 'Attendance Reports', icon: 'fa fa-file-alt', section: 'Attendance & Time' },
  { slug: 'reports', file: 'reports.html', title: 'Reports', icon: 'fa fa-chart-bar', section: 'Attendance & Time' },
  { slug: 'overtime', file: 'overtime.html', title: 'Overtime', icon: 'fa fa-clock', section: 'Attendance & Time' },
  { slug: 'leaves', file: 'leaves.html', title: 'Leave & Vacation', icon: 'fa fa-umbrella-beach', section: 'Attendance & Time' },
  { slug: 'calendar', file: 'calendar.html', title: 'Calendar', icon: 'fa fa-calendar-day', section: 'Attendance & Time' },
  { slug: 'admins', file: 'admins.html', title: 'Admins & Settings', icon: 'fa fa-cog', section: 'Settings' },
  { slug: 'admin-form', file: 'admin-form.html', title: 'Admin', icon: 'fa fa-user-shield', section: 'Settings' },
  { slug: 'my-account', file: 'my-account.html', title: 'My Account', icon: 'fa fa-user-circle', section: 'Settings' },
  {
    slug: 'forgot-password',
    file: 'forgot-password.html',
    title: 'Forgot password',
    icon: 'fa fa-key',
    section: '',
    public: true,
    headers: { 'X-Robots-Tag': 'noindex, nofollow' },
  },
  {
    slug: 'reset-password',
    file: 'reset-password.html',
    title: 'Reset password',
    icon: 'fa fa-key',
    section: '',
    public: true,
    headers: { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' },
  },
];

export const PUBLIC_PAGES = PAGES.filter((page) => page.public);

/** The public check-in page is served directly, not through the page loop. */
export const PUBLIC_CHECKIN_FILES = ['checkin.html'] as const;

/** Pages that must never appear in search results. */
export const NOINDEX_PAGE_PATHS = [
  '/',
  '/checkin',
  '/checkin.html',
  '/login.html',
  '/forgot-password.html',
  '/reset-password.html',
] as const;
