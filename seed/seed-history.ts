/**
 * Deterministic 2025-2026 HR history -- local/test databases only.
 *
 *   npm run seed:history
 *   npm run seed:history -- --reset
 *   npm run seed:2025        (alias for the same history)
 *
 * Safety rails:
 *  - refuses NODE_ENV=production
 *  - refuses any database whose name does not contain "test" or "demo"
 *  - requires an existing active administrator (created with `npm run seed`)
 *  - refuses to add data to a database that already has employees, unless
 *    --reset is supplied; --reset deletes only attendance, overtime, leaves,
 *    events, employees and departments, never admins or sessions
 *
 * The administrative user is read only. This script never creates or changes
 * an administrator.
 */
import type { SeedHistoryResult, SeedVerification, SeedYearStat } from './seed-history-data.ts';

function pad(value: string | number, width: number, right = false): string {
  const text = String(value);
  return right ? text.padStart(width) : text.padEnd(width);
}

function line(character = '-'): string {
  return character.repeat(96);
}

function printYearTotals(year: SeedYearStat): void {
  const totals = year.totals;
  console.log(
    `${pad(year.year, 7)}${pad(totals.present, 9, true)}${pad(totals.late, 7, true)}` +
      `${pad(totals.absent, 8, true)}${pad(totals.onLeave, 10, true)}${pad(totals.vacation, 10, true)}` +
      `${pad(totals.notMarked, 12, true)}${pad(totals.expectedSlots, 12, true)}` +
      `${pad(totals.futureLeaveRows, 12, true)}`,
  );
}

function printAllowanceChecks(checks: SeedVerification['allowanceChecks']): void {
  console.log('');
  console.log('Holiday allowance by employee and year');
  console.log(
    `${pad('Employee', 22)}${pad('Year', 6)}${pad('Allowance', 10, true)}` +
      `${pad('Total', 7, true)}${pad('Used', 7, true)}${pad('Pending', 9, true)}${pad('Remaining', 11, true)}`,
  );
  console.log(line());
  for (const row of [...checks].sort((a, b) => a.name.localeCompare(b.name) || a.year - b.year)) {
    console.log(
      `${pad(row.name, 22)}${pad(row.year, 6)}${pad(row.allowance, 10, true)}` +
        `${pad(row.total, 7, true)}${pad(row.used, 7, true)}${pad(row.pending, 9, true)}` +
        `${pad(row.remaining, 11, true)}`,
    );
  }

  const check = (name: string, year: number) =>
    checks.find((row) => row.name === name && row.year === year);
  const mia2026 = check('Mia Knight', 2026);
  const amelia2025 = check('Amelia Bennett', 2025);
  const amelia2026 = check('Amelia Bennett', 2026);
  const harry2025 = check('Harry Nelson', 2025);
  const harry2026 = check('Harry Nelson', 2026);
  const noah2025 = check('Noah Carter', 2025);
  const noah2026 = check('Noah Carter', 2026);

  console.log('');
  console.log('Allowance hand checks');
  console.log(
    `  Mia Knight 2026:      ${mia2026?.allowance} total; ` +
      `${mia2026?.used} used; ${mia2026?.remaining} remaining (exact 28-day case).`,
  );
  console.log(
    `  Harry Nelson:        2025 ${harry2025?.used}/${harry2025?.total} used, ` +
      `${harry2025?.remaining} unused (expired); 2026 ${harry2026?.used} used, ` +
      `${harry2026?.remaining} remaining (no carry-over case).`,
  );
  console.log(
    `  Amelia Bennett:      2025 ${amelia2025?.remaining} unused; 2026 ` +
      `${amelia2026?.used}/${amelia2026?.total} used, ${amelia2026?.remaining} remaining ` +
      '(the unused 2025 days do not rescue the 2026 over-allowance).',
  );
  console.log(
    `  Noah Carter:          2025 ${noah2025?.used} vacation day(s) used, 2026 ${noah2026?.used}. ` +
      'The 22 Dec 2025 - 2 Jan 2026 leave alone splits 3 + 1 = 4 counted days; the Christmas closure ' +
      'and bank holidays are skipped.',
  );
  const jack2025 = check('Jack Shaw', 2025);
  const theo2026 = check('Theo Cooper', 2026);
  console.log(
    `  Pending vacation:     Jack Shaw 2025 ${jack2025?.pending} day(s) pending, ` +
      `Theo Cooper 2026 ${theo2026?.pending} day(s) pending; neither reduces the remaining days.`,
  );
}

function printResult(result: SeedHistoryResult): void {
  const counts = result.counts;
  const verification = result.verification;

  console.log('');
  console.log('[seed:history] dataset complete');
  console.log(`  database:       ${process.env.MONGODB_URI ? 'guarded test/demo database' : 'test/demo database'}`);
  console.log(`  timezone:       Europe/London`);
  console.log(`  working week:   Monday-Friday`);
  console.log(`  marked period:  2025-01-01 -> ${verification.october2026.lastMarked}`);
  console.log(`  full period:    2025-01-01 -> 2026-12-31 (events and future approved leaves)`);
  console.log(`  departments:    ${counts.departments}`);
  console.log(
    `  employees:      ${counts.employees} (${counts.activeEmployees} active, ${counts.inactiveEmployees} inactive, ` +
      `${counts.terminatedEmployees} terminated; ${counts.newHires2025} hired in 2025, ${counts.newHires2026} in 2026)`,
  );
  console.log(
    `  attendance:     ${counts.attendance} rows (${counts.manualAttendance} manual, ${counts.leaveAttendance} leave_sync; ` +
      `${counts.futureLeaveRows} future leave_sync rows)`,
  );
  console.log(
    `  leaves:         ${counts.approvedLeaves} approved (${counts.approvedLeaves2025} in 2025, ${counts.approvedLeaves2026} in 2026; ` +
      `${counts.approvedLeavesAfterCutoff} start after 2026-10-20), ${counts.pendingLeaves} pending, ${counts.rejectedLeaves} rejected`,
  );
  console.log(
    `  overtime:       ${counts.overtime} entries (${counts.overtime2025} in 2025, ${counts.overtime2026} in 2026 to 20 Oct) | ` +
      `events: ${counts.events} (${counts.events2025} in 2025, ${counts.events2026} in 2026) | unmarked: ${counts.deliberatelyUnmarked}`,
  );

  if (Object.values(result.resetDeleted).some((count) => count > 0)) {
    console.log('');
    console.log('[seed:history] reset deleted only:');
    console.log(
      `  attendance=${result.resetDeleted.attendance ?? 0} overtime=${result.resetDeleted.overtime ?? 0} ` +
        `leaves=${result.resetDeleted.leaves ?? 0} events=${result.resetDeleted.events ?? 0} ` +
        `employees=${result.resetDeleted.employees ?? 0} departments=${result.resetDeleted.departments ?? 0}`,
    );
    console.log('  admins and sessions were not touched.');
  }

  console.log('');
  console.log('Attendance by month');
  console.log(
    `${pad('Month', 9)}${pad('Present', 9, true)}${pad('Late', 7, true)}${pad('Absent', 8, true)}` +
      `${pad('On leave', 10, true)}${pad('Vacation', 10, true)}${pad('Not marked', 12, true)}` +
      `${pad('Expected', 10, true)}`,
  );
  console.log(line());
  for (const month of verification.months) {
    console.log(
      `${pad(month.month, 9)}${pad(month.present, 9, true)}${pad(month.late, 7, true)}` +
        `${pad(month.absent, 8, true)}${pad(month.onLeave, 10, true)}${pad(month.vacation, 10, true)}` +
        `${pad(month.notMarked, 12, true)}${pad(month.expectedSlots, 10, true)}`,
    );
  }

  console.log('');
  console.log('Year totals (future leave rows are approved leave_sync rows after 2026-10-20)');
  console.log(
    `${pad('Year', 7)}${pad('Present', 9, true)}${pad('Late', 7, true)}${pad('Absent', 8, true)}` +
      `${pad('On leave', 10, true)}${pad('Vacation', 10, true)}${pad('Not marked', 12, true)}` +
      `${pad('Expected', 12, true)}${pad('Future', 12, true)}`,
  );
  console.log(line());
  for (const year of verification.years) printYearTotals(year);
  const overall = verification.overallTotals;
  console.log(line());
  console.log(
    `${pad('TOTAL', 7)}${pad(overall.present, 9, true)}${pad(overall.late, 7, true)}` +
      `${pad(overall.absent, 8, true)}${pad(overall.onLeave, 10, true)}${pad(overall.vacation, 10, true)}` +
      `${pad(overall.notMarked, 12, true)}${pad(overall.expectedSlots, 12, true)}` +
      `${pad(overall.futureLeaveRows, 12, true)}`,
  );

  console.log('');
  console.log('Shares');
  for (const year of verification.years) {
    console.log(
      `  ${year.year}: recorded statuses present ${year.statusShares.present}% | late ${year.statusShares.late}% | ` +
        `absent ${year.statusShares.absent}% | on_leave ${year.statusShares.onLeave}% | vacation ${year.statusShares.vacation}%`,
    );
    console.log(
      `             counted-day mix present ${year.countedMix.present}% | late ${year.countedMix.late}% | ` +
        `absent ${year.countedMix.absent}% | not marked ${year.notMarkedShare}% of expected slots`,
    );
  }
  const countedTotal = overall.present + overall.late + overall.absent;
  const share = (part: number) => (countedTotal ? Math.round((part / countedTotal) * 1000) / 10 : 0);
  console.log(
    `  all history: counted-day mix present ${share(overall.present)}% | late ${share(overall.late)}% | ` +
      `absent ${share(overall.absent)}% (target roughly 88 / 7 / 3)`,
  );
  console.log(
    `  not marked: ${overall.notMarked} of ${overall.expectedSlots} expected working days ` +
      `(${verification.notMarkedShare}%; deliberately about 0.3%)`,
  );
  console.log(
    `  ${verification.october2026.lastMarked.slice(0, 7)} is partial: ${verification.october2026.markedWorkingDays} working days ` +
      `through ${verification.october2026.lastMarked}; the full month has ${verification.october2026.fullWorkingDays} working days.`,
  );

  console.log('');
  console.log('Events by type and year');
  for (const type of ['holiday', 'deadline', 'meeting', 'event'] as const) {
    console.log(
      `  ${pad(type, 10)} 2025=${pad(verification.eventCountsByYear['2025']?.[type] ?? 0, 3, true)} ` +
        `2026=${pad(verification.eventCountsByYear['2026']?.[type] ?? 0, 3, true)} ` +
        `total=${pad(verification.eventCounts[type], 3, true)}`,
    );
  }

  console.log('');
  console.log('Events by month (by start date)');
  console.log(
    `${pad('Month', 9)}${pad('Holiday', 9, true)}${pad('Deadline', 10, true)}${pad('Meeting', 9, true)}` +
      `${pad('Event', 8, true)}${pad('Total', 7, true)}`,
  );
  console.log(line());
  for (const month of verification.eventsByMonth) {
    console.log(
      `${pad(month.month, 9)}${pad(month.holiday, 9, true)}${pad(month.deadline, 10, true)}` +
        `${pad(month.meeting, 9, true)}${pad(month.event, 8, true)}${pad(month.total, 7, true)}`,
    );
  }

  console.log('');
  console.log('Multi-day events (inclusive end dates)');
  for (const event of verification.multiDayEvents) {
    console.log(`  ${event.startDate} -> ${event.endDate}  [${event.type}] ${event.title}`);
  }

  console.log('');
  console.log('Edge-case events');
  for (const event of verification.edgeCaseEvents) {
    console.log(
      `  ${event.startDate}${event.endDate !== event.startDate ? ` -> ${event.endDate}` : ''}  ` +
        `[${event.type}] ${event.title}  {${event.edgeCases.join(', ')}}`,
    );
  }

  console.log('');
  console.log('Top Employees hand check');
  for (const check of verification.topChecks) {
    console.log(`  ${check.month} (raw calculation vs dashboard service): ${check.matches ? 'MATCH' : 'MISMATCH'}`);
    check.expected.forEach((employee, index) => {
      console.log(
        `    ${index + 1}. ${pad(employee.name, 20)} score ${pad(String(employee.score), 3, true)} ` +
          `(${employee.present} present / ${employee.late} late / ${employee.absent} absent)`,
      );
    });
  }
  for (const year of verification.dashboardYears) {
    console.log(
      `  dashboard year ${year.year}: ${year.matches ? 'MATCH' : 'MISMATCH'} ` +
        `(${year.months} months, attendance=${year.attendance}, absence=${year.absence}, leave=${year.leave})`,
    );
  }

  console.log('');
  console.log('Dashboard and attendance-sheet fixed checks');
  console.log(
    `  2026-10-21 summary: ${verification.dashboardToday.matches ? 'MATCH' : 'MISMATCH'} ` +
      `(active=${verification.dashboardToday.totalEmployees}, on leave=${verification.dashboardToday.onLeave}, ` +
      `not marked=${verification.dashboardToday.notMarked}, expected=${verification.dashboardToday.expectedNotMarked})`,
  );
  console.log(
    `  attendance sheet 2026-10-20: ${verification.attendanceSheet.lastMarkedRows} rows ` +
      `(${verification.attendanceSheet.lastMarkedManualRows} manual); ` +
      `2026-10-21: ${verification.attendanceSheet.nextDayRows} rows ` +
      `(${verification.attendanceSheet.nextDayLeaveSyncRows} leave_sync, ${verification.attendanceSheet.nextDayManualRows} manual)`,
  );

  console.log('');
  console.log('Documented bank-holiday leave cases');
  for (const leave of verification.holidayLeaves) {
    console.log(
      `  ${leave.employeeName}: ${leave.startDate} -> ${leave.endDate}, ${leave.days} working days. ` +
        'The range deliberately includes an England bank holiday; the holiday is skipped, so only the ' +
        'remaining working days count and create attendance rows.',
    );
  }

  printAllowanceChecks(verification.allowanceChecks);

  console.log('');
  console.log(`Assertions passed: ${verification.assertions.length}`);
  for (const assertion of verification.assertions) {
    console.log(`  [ok] ${assertion}`);
  }

  console.log('');
  console.log(`Checksum: ${result.checksum}`);
  console.log('  (canonical business data, including events; ObjectIds and timestamps excluded)');
  console.log(line('='));
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[seed:history] refused: NODE_ENV=production. The history dataset is for local/test databases only.',
    );
    process.exitCode = 1;
    return;
  }

  // Force the date-only dataset rules before the application modules read the
  // environment. Existing shell values are deliberately overridden so the
  // calendar and the Mon-Fri assumptions cannot silently change.
  process.env.APP_TIMEZONE = 'Europe/London';
  process.env.WORKING_WEEK = '1,2,3,4,5';

  const [{ env }, { connectDatabase, disconnectDatabase }, { AdminModel }, data] = await Promise.all([
    import('../src/config/env.ts'),
    import('../src/config/db.ts'),
    import('../src/models/Admin.ts'),
    import('./seed-history-data.ts'),
  ]);

  if (env.isProduction) {
    console.error(
      '[seed:history] refused: NODE_ENV=production. The history dataset is for local/test databases only.',
    );
    process.exitCode = 1;
    return;
  }

  const databaseName = data.databaseNameFromUri(env.mongodbUri);
  if (!data.isSafeSeedDatabaseName(databaseName)) {
    const detail = databaseName
      ? `database name "${databaseName}" does not contain "test" or "demo"`
      : 'MONGODB_URI does not include a database name';
    console.error(
      `[seed:history] refused: ${detail}. Point MONGODB_URI at a dedicated test/demo database, ` +
        'for example mongodb://127.0.0.1:27017/lean-hrm-test.',
    );
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  try {
    const admins = await AdminModel.find({ isActive: true })
      .sort({ createdAt: 1, _id: 1 })
      .select('name email')
      .lean();

    if (admins.length === 0) {
      console.error(
        '[seed:history] refused: no active administrator exists. Create one first with npm run seed ' +
          '(SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD).',
      );
      process.exitCode = 1;
      return;
    }

    const seedEmail = env.seedAdmin.email.trim().toLowerCase();
    const admin =
      (seedEmail ? admins.find((candidate) => candidate.email === seedEmail) : undefined) ??
      admins[0];

    if (!admin) {
      console.error('[seed:history] refused: no active administrator could be selected.');
      process.exitCode = 1;
      return;
    }

    if (seedEmail && admin.email !== seedEmail) {
      console.warn(
        `[seed:history] warning: SEED_ADMIN_EMAIL (${seedEmail}) was not found; ` +
          `using the oldest active administrator (${admin.email}).`,
      );
    }

    const reset = process.argv.includes('--reset');
    console.log(
      `[seed:history] admin actor: ${admin.name} <${admin.email}> (read only; admins are never created or modified)`,
    );
    console.log(
      `[seed:history] target database: ${databaseName} | APP_TIMEZONE=Europe/London | WORKING_WEEK=1,2,3,4,5`,
    );
    console.log(`[seed:history] reset requested: ${reset ? 'yes' : 'no'}`);
    console.log('[seed:history] seed:2025 is an alias for this same command.');

    const result = await data.seedHistoryData({
      adminId: String(admin._id),
      reset,
    });

    printResult(result);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[seed:history] failed:', error);
  process.exit(1);
});
