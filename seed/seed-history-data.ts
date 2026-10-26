/**
 * Deterministic 2025-2026 HR history for local/test databases.
 *
 * This module contains no CLI guards: `seed/seed-history.ts` is the safe entry
 * point. Keeping the generator here lets the tests run it against an in-memory
 * MongoDB without starting a process.
 *
 * The business data is deterministic. Mongo ObjectIds and `createdAt` /
 * `updatedAt` timestamps are deliberately excluded from the checksum because
 * they are database-generated, not part of the dataset.
 */
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../src/config/env.ts';
import { AdminModel } from '../src/models/Admin.ts';
import { AttendanceModel } from '../src/models/Attendance.ts';
import { DepartmentModel } from '../src/models/Department.ts';
import { EmployeeModel } from '../src/models/Employee.ts';
import { EventModel, EVENT_TYPES, type EventType } from '../src/models/Event.ts';
import { LeaveModel, type LeaveStatus, type LeaveType } from '../src/models/Leave.ts';
import { LeaveAllowanceModel } from '../src/models/LeaveAllowance.ts';
import { OvertimeModel } from '../src/models/Overtime.ts';
import { createLeave, leaveWorkingDays } from '../src/services/leaves.ts';
import {
  dashboardMonth,
  dashboardSummary,
  dashboardYear,
  type TopEmployee,
} from '../src/services/dashboard.ts';
import {
  addDays,
  eachDate,
  isWorkingDay,
  isoWeekday,
  monthBounds,
  workingDaysBetween,
} from '../src/utils/dates.ts';

export const SEED_HISTORY_START_YEAR = 2025;
export const SEED_HISTORY_LAST_MARKED = '2026-10-20';
export const SEED_HISTORY_START = '2025-01-01';
export const SEED_HISTORY_END = '2026-12-31';
export const SEED_HISTORY_RANDOM_SEED = 0x2025c0de;

export const ENGLAND_BANK_HOLIDAYS_2025 = [
  '2025-01-01',
  '2025-04-18',
  '2025-04-21',
  '2025-05-05',
  '2025-05-26',
  '2025-08-25',
  '2025-12-25',
  '2025-12-26',
] as const;

export const ENGLAND_BANK_HOLIDAYS_2026 = [
  '2026-01-01',
  '2026-04-03',
  '2026-04-06',
  '2026-05-04',
  '2026-05-25',
  '2026-08-31',
  '2026-12-25',
  '2026-12-28',
] as const;

export const ENGLAND_BANK_HOLIDAYS = [
  ...ENGLAND_BANK_HOLIDAYS_2025,
  ...ENGLAND_BANK_HOLIDAYS_2026,
] as const;

const BANK_HOLIDAY_SET = new Set<string>(ENGLAND_BANK_HOLIDAYS);

export function isEnglandBankHoliday(date: string): boolean {
  return BANK_HOLIDAY_SET.has(date);
}

export type BehaviourProfile = 'reliable' | 'oftenLate' | 'highAbsence' | 'average';

export interface SeedDepartmentDefinition {
  name: string;
  location: string;
  description: string;
}

export interface SeedEmployeeDefinition {
  key: string;
  name: string;
  email: string | null;
  phone: string;
  department: string;
  position: string;
  hireDate: string;
  status: 'active' | 'inactive' | 'terminated';
  profile: BehaviourProfile;
  /** Not stored by the Employee model; used to bound generated records. */
  leftDate?: string;
}

export const SEED_HISTORY_DEPARTMENTS: readonly SeedDepartmentDefinition[] = [
  {
    name: 'Operations',
    location: 'Bristol',
    description: 'Facilities, logistics and procurement.',
  },
  {
    name: 'Finance',
    location: 'London',
    description: 'Financial control, accounts and credit.',
  },
  {
    name: 'Human Resources',
    location: 'Manchester',
    description: 'People operations and recruitment.',
  },
  {
    name: 'Sales',
    location: 'London',
    description: 'Account management and business development.',
  },
  {
    name: 'IT',
    location: 'Leeds',
    description: 'Infrastructure, support and data.',
  },
] as const;

/**
 * 26 employees: Operations 7, Finance 5, HR 4, Sales 6, IT 4.
 *
 * Three started in 2025 and two in 2026. One left on 30 June 2025, one left on
 * 14 August 2026, and one was made inactive on 31 March 2026. Five
 * deliberately have no email address. The leaving/deactivation date is
 * metadata because the existing Employee schema has no such field.
 */
export const SEED_HISTORY_EMPLOYEES: readonly SeedEmployeeDefinition[] = [
  {
    key: 'amelia-bennett',
    name: 'Amelia Bennett',
    email: 'amelia.bennett@example.com',
    phone: '+44 7700 900101',
    department: 'Operations',
    position: 'Operations Manager',
    hireDate: '2018-04-09',
    status: 'active',
    profile: 'reliable',
  },
  {
    key: 'noah-carter',
    name: 'Noah Carter',
    email: 'noah.carter@example.com',
    phone: '+44 7700 900102',
    department: 'Operations',
    position: 'Logistics Coordinator',
    hireDate: '2020-01-13',
    status: 'active',
    profile: 'average',
  },
  {
    key: 'isla-dawson',
    name: 'Isla Dawson',
    email: 'isla.dawson@example.com',
    phone: '+44 7700 900103',
    department: 'Operations',
    position: 'Facilities Assistant',
    hireDate: '2021-09-06',
    status: 'active',
    profile: 'reliable',
  },
  {
    key: 'liam-ellis',
    name: 'Liam Ellis',
    email: null,
    phone: '+44 7700 900104',
    department: 'Operations',
    position: 'Office Administrator',
    hireDate: '2019-06-24',
    status: 'active',
    profile: 'highAbsence',
  },
  {
    key: 'sophia-foster',
    name: 'Sophia Foster',
    email: 'sophia.foster@example.com',
    phone: '+44 7700 900105',
    department: 'Operations',
    position: 'Warehouse Lead',
    hireDate: '2017-11-20',
    status: 'active',
    profile: 'reliable',
  },
  {
    key: 'mason-graham',
    name: 'Mason Graham',
    email: 'mason.graham@example.com',
    phone: '+44 7700 900106',
    department: 'Operations',
    position: 'Dispatch Coordinator',
    hireDate: '2022-03-14',
    status: 'active',
    profile: 'oftenLate',
  },
  {
    key: 'ava-hughes',
    name: 'Ava Hughes',
    email: 'ava.hughes@example.com',
    phone: '+44 7700 900107',
    department: 'Operations',
    position: 'Procurement Officer',
    hireDate: '2025-09-01',
    status: 'active',
    profile: 'average',
  },
  {
    key: 'olivia-irwin',
    name: 'Olivia Irwin',
    email: 'olivia.irwin@example.com',
    phone: '+44 7700 900108',
    department: 'Finance',
    position: 'Finance Manager',
    hireDate: '2016-02-08',
    status: 'active',
    profile: 'reliable',
  },
  {
    key: 'ethan-jackson',
    name: 'Ethan Jackson',
    email: null,
    phone: '+44 7700 900109',
    department: 'Finance',
    position: 'Accountant',
    hireDate: '2019-10-07',
    status: 'active',
    profile: 'average',
  },
  {
    key: 'mia-knight',
    name: 'Mia Knight',
    email: 'mia.knight@example.com',
    phone: '+44 7700 900110',
    department: 'Finance',
    position: 'Accounts Assistant',
    hireDate: '2021-04-12',
    status: 'active',
    profile: 'oftenLate',
  },
  {
    key: 'lucas-lawson',
    name: 'Lucas Lawson',
    email: 'lucas.lawson@example.com',
    phone: '+44 7700 900111',
    department: 'Finance',
    position: 'Credit Controller',
    hireDate: '2020-07-27',
    status: 'active',
    profile: 'highAbsence',
  },
  {
    key: 'grace-morgan',
    name: 'Grace Morgan',
    email: 'grace.morgan@example.com',
    phone: '+44 7700 900112',
    department: 'Human Resources',
    position: 'HR Manager',
    hireDate: '2015-09-14',
    status: 'active',
    profile: 'reliable',
  },
  {
    key: 'harry-nelson',
    name: 'Harry Nelson',
    email: 'harry.nelson@example.com',
    phone: '+44 7700 900113',
    department: 'Human Resources',
    position: 'HR Advisor',
    hireDate: '2018-01-22',
    status: 'active',
    profile: 'average',
  },
  {
    key: 'chloe-owen',
    name: 'Chloe Owen',
    email: null,
    phone: '+44 7700 900114',
    department: 'Human Resources',
    position: 'Recruiter',
    hireDate: '2022-06-06',
    status: 'active',
    profile: 'highAbsence',
  },
  {
    key: 'leo-palmer',
    name: 'Leo Palmer',
    email: 'leo.palmer@example.com',
    phone: '+44 7700 900115',
    department: 'Human Resources',
    position: 'People Coordinator',
    hireDate: '2024-02-19',
    status: 'inactive',
    profile: 'average',
    leftDate: '2026-03-31',
  },
  {
    key: 'archie-quinn',
    name: 'Archie Quinn',
    email: 'archie.quinn@example.com',
    phone: '+44 7700 900116',
    department: 'Sales',
    position: 'Sales Director',
    hireDate: '2014-03-10',
    status: 'active',
    profile: 'reliable',
  },
  {
    key: 'freya-reed',
    name: 'Freya Reed',
    email: 'freya.reed@example.com',
    phone: '+44 7700 900117',
    department: 'Sales',
    position: 'Account Executive',
    hireDate: '2020-09-28',
    status: 'active',
    profile: 'oftenLate',
  },
  {
    key: 'jack-shaw',
    name: 'Jack Shaw',
    email: 'jack.shaw@example.com',
    phone: '+44 7700 900118',
    department: 'Sales',
    position: 'Sales Analyst',
    hireDate: '2021-11-15',
    status: 'terminated',
    profile: 'average',
    leftDate: '2026-08-14',
  },
  {
    key: 'ella-turner',
    name: 'Ella Turner',
    email: null,
    phone: '+44 7700 900119',
    department: 'Sales',
    position: 'Account Manager',
    hireDate: '2019-04-01',
    status: 'active',
    profile: 'highAbsence',
  },
  {
    key: 'oscar-underwood',
    name: 'Oscar Underwood',
    email: 'oscar.underwood@example.com',
    phone: '+44 7700 900120',
    department: 'Sales',
    position: 'Business Development Rep',
    hireDate: '2023-01-09',
    status: 'terminated',
    profile: 'average',
    leftDate: '2025-06-30',
  },
  {
    key: 'ruby-walker',
    name: 'Ruby Walker',
    email: 'ruby.walker@example.com',
    phone: '+44 7700 900121',
    department: 'IT',
    position: 'IT Manager',
    hireDate: '2016-08-15',
    status: 'active',
    profile: 'reliable',
  },
  {
    key: 'henry-young',
    name: 'Henry Young',
    email: 'henry.young@example.com',
    phone: '+44 7700 900122',
    department: 'IT',
    position: 'Systems Administrator',
    hireDate: '2018-12-03',
    status: 'active',
    profile: 'average',
  },
  {
    key: 'evie-barker',
    name: 'Evie Barker',
    email: 'evie.barker@example.com',
    phone: '+44 7700 900123',
    department: 'IT',
    position: 'Support Engineer',
    hireDate: '2025-02-14',
    status: 'active',
    profile: 'reliable',
  },
  {
    key: 'theo-cooper',
    name: 'Theo Cooper',
    email: 'theo.cooper@example.com',
    phone: '+44 7700 900124',
    department: 'IT',
    position: 'Data Analyst',
    hireDate: '2025-07-07',
    status: 'active',
    profile: 'oftenLate',
  },
  {
    key: 'maya-patel',
    name: 'Maya Patel',
    email: 'maya.patel@example.com',
    phone: '+44 7700 900125',
    department: 'Finance',
    position: 'Finance Assistant',
    hireDate: '2026-01-12',
    status: 'active',
    profile: 'average',
  },
  {
    key: 'oliver-grant',
    name: 'Oliver Grant',
    email: null,
    phone: '+44 7700 900126',
    department: 'Sales',
    position: 'Account Coordinator',
    hireDate: '2026-04-07',
    status: 'active',
    profile: 'reliable',
  },
] as const;

interface LeavePlan {
  key: string;
  /** Preferred employee lookup. Older plans fall back to the first name in key. */
  employeeKey?: string;
  type: LeaveType;
  category: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  /** Seed-only: deliberately book a vacation beyond the allowance. */
  confirmOverAllowance?: boolean;
}

/** 40 approved leaves in 2025. Only the Harry Nelson May range includes a bank holiday. */
export const SEED_2025_APPROVED_LEAVES: readonly LeavePlan[] = [
  {
    key: 'amelia-jan',
    type: 'leave',
    category: 'sick',
    startDate: '2025-01-13',
    endDate: '2025-01-14',
    reason: 'Flu recovery',
  },
  {
    key: 'lucas-jan',
    type: 'leave',
    category: 'sick',
    startDate: '2025-01-20',
    endDate: '2025-01-22',
    reason: 'Medical appointment',
  },
  {
    key: 'chloe-jan',
    type: 'leave',
    category: 'personal',
    startDate: '2025-01-27',
    endDate: '2025-01-27',
    reason: 'Family matter',
  },
  {
    key: 'archie-jan',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-01-30',
    endDate: '2025-01-31',
    reason: 'Annual leave',
  },
  {
    key: 'mia-feb',
    type: 'leave',
    category: 'casual',
    startDate: '2025-02-10',
    endDate: '2025-02-11',
    reason: 'Home appointment',
  },
  {
    key: 'harry-feb',
    type: 'leave',
    category: 'sick',
    startDate: '2025-02-19',
    endDate: '2025-02-19',
    reason: 'Migraine',
  },
  {
    key: 'ruby-feb',
    type: 'leave',
    category: 'personal',
    startDate: '2025-02-24',
    endDate: '2025-02-25',
    reason: 'Family matter',
  },
  {
    key: 'noah-mar',
    type: 'leave',
    category: 'casual',
    startDate: '2025-03-10',
    endDate: '2025-03-12',
    reason: 'House move',
  },
  {
    key: 'ella-mar',
    type: 'leave',
    category: 'sick',
    startDate: '2025-03-24',
    endDate: '2025-03-25',
    reason: 'Medical appointment',
  },
  {
    key: 'archie-mar',
    type: 'time_off',
    category: null,
    startDate: '2025-03-27',
    endDate: '2025-03-27',
    reason: 'Personal appointment',
  },
  {
    key: 'isla-apr',
    type: 'leave',
    category: 'personal',
    startDate: '2025-04-08',
    endDate: '2025-04-09',
    reason: 'Family matter',
  },
  {
    key: 'henry-apr',
    type: 'time_off',
    category: null,
    startDate: '2025-04-15',
    endDate: '2025-04-16',
    reason: 'Home appointment',
  },
  {
    key: 'freya-apr',
    type: 'leave',
    category: 'sick',
    startDate: '2025-04-28',
    endDate: '2025-04-29',
    reason: 'Flu recovery',
  },
  {
    key: 'harry-may',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-05-05',
    endDate: '2025-06-04',
    reason: 'Annual leave (the 5 May and 26 May bank holidays do not count)',
  },
  {
    key: 'jack-may',
    type: 'leave',
    category: 'casual',
    startDate: '2025-05-19',
    endDate: '2025-05-20',
    reason: 'Home appointment',
  },
  {
    key: 'sophia-may',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-05-27',
    endDate: '2025-05-30',
    reason: 'Annual leave',
  },
  {
    key: 'oscar-jun',
    type: 'leave',
    category: 'casual',
    startDate: '2025-06-09',
    endDate: '2025-06-10',
    reason: 'Personal appointment',
  },
  {
    key: 'liam-jun',
    type: 'leave',
    category: 'sick',
    startDate: '2025-06-16',
    endDate: '2025-06-16',
    reason: 'Medical appointment',
  },
  {
    key: 'grace-jun',
    type: 'time_off',
    category: null,
    startDate: '2025-06-23',
    endDate: '2025-06-24',
    reason: 'Family matter',
  },
  {
    key: 'olivia-jul',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-07-07',
    endDate: '2025-07-11',
    reason: 'Annual leave',
  },
  {
    key: 'noah-jul',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-07-14',
    endDate: '2025-07-18',
    reason: 'Annual leave',
  },
  {
    key: 'mia-jul',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-07-21',
    endDate: '2025-07-25',
    reason: 'Annual leave',
  },
  {
    key: 'theo-jul',
    type: 'leave',
    category: 'casual',
    startDate: '2025-07-14',
    endDate: '2025-07-15',
    reason: 'Home appointment',
  },
  {
    key: 'henry-jul',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-07-28',
    endDate: '2025-07-31',
    reason: 'Annual leave',
  },
  {
    key: 'amelia-aug',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-08-04',
    endDate: '2025-08-08',
    reason: 'Annual leave',
  },
  {
    key: 'jack-aug',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-08-11',
    endDate: '2025-08-15',
    reason: 'Annual leave',
  },
  {
    key: 'ruby-aug',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-08-18',
    endDate: '2025-08-22',
    reason: 'Annual leave',
  },
  {
    key: 'isla-aug',
    type: 'time_off',
    category: null,
    startDate: '2025-08-26',
    endDate: '2025-08-27',
    reason: 'Personal appointment',
  },
  {
    key: 'ethan-aug',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-08-27',
    endDate: '2025-08-29',
    reason: 'Annual leave',
  },
  {
    key: 'ava-sep',
    type: 'leave',
    category: 'sick',
    startDate: '2025-09-08',
    endDate: '2025-09-08',
    reason: 'Medical appointment',
  },
  {
    key: 'sophia-sep',
    type: 'leave',
    category: 'casual',
    startDate: '2025-09-15',
    endDate: '2025-09-16',
    reason: 'Family matter',
  },
  {
    key: 'chloe-oct',
    type: 'leave',
    category: 'personal',
    startDate: '2025-10-13',
    endDate: '2025-10-14',
    reason: 'Family matter',
  },
  {
    key: 'freya-oct',
    type: 'time_off',
    category: null,
    startDate: '2025-10-20',
    endDate: '2025-10-20',
    reason: 'Home appointment',
  },
  {
    key: 'grace-nov',
    type: 'leave',
    category: 'sick',
    startDate: '2025-11-10',
    endDate: '2025-11-11',
    reason: 'Flu recovery',
  },
  {
    key: 'lucas-nov',
    type: 'leave',
    category: 'personal',
    startDate: '2025-11-24',
    endDate: '2025-11-24',
    reason: 'Family matter',
  },
  {
    key: 'olivia-dec',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-12-01',
    endDate: '2025-12-03',
    reason: 'Annual leave',
  },
  {
    key: 'theo-dec',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-12-15',
    endDate: '2025-12-19',
    reason: 'Annual leave',
  },
  {
    key: 'noah-dec',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-12-22',
    endDate: '2026-01-02',
    reason: 'Christmas and New Year break (cross-year)',
  },
  {
    key: 'harry-dec',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-12-18',
    endDate: '2025-12-19',
    reason: 'Annual leave',
  },
  {
    key: 'amelia-dec',
    type: 'time_off',
    category: null,
    startDate: '2025-12-29',
    endDate: '2025-12-31',
    reason: 'Personal appointment',
  },
] as const;

/**
 * Thirty approved leaves before 21 October 2026, plus three future leaves.
 * Only Grace Morgan's 4-6 May range deliberately includes a bank holiday.
 */
export const SEED_2026_APPROVED_LEAVES: readonly LeavePlan[] = [
  {
    key: 'amelia-2026-jan',
    employeeKey: 'amelia-bennett',
    type: 'leave',
    category: 'sick',
    startDate: '2026-01-12',
    endDate: '2026-01-13',
    reason: 'Flu recovery',
  },
  {
    key: 'harry-2026-jan',
    employeeKey: 'harry-nelson',
    type: 'leave',
    category: 'sick',
    startDate: '2026-01-19',
    endDate: '2026-01-20',
    reason: 'Medical appointment',
  },
  {
    key: 'liam-2026-jan',
    employeeKey: 'liam-ellis',
    type: 'leave',
    category: 'sick',
    startDate: '2026-01-26',
    endDate: '2026-01-26',
    reason: 'Medical appointment',
  },
  {
    key: 'noah-2026-feb',
    employeeKey: 'noah-carter',
    type: 'leave',
    category: 'sick',
    startDate: '2026-02-02',
    endDate: '2026-02-02',
    reason: 'Migraine',
  },
  {
    key: 'isla-2026-feb',
    employeeKey: 'isla-dawson',
    type: 'leave',
    category: 'personal',
    startDate: '2026-02-09',
    endDate: '2026-02-10',
    reason: 'Family matter',
  },
  {
    key: 'leo-2026-feb',
    employeeKey: 'leo-palmer',
    type: 'time_off',
    category: null,
    startDate: '2026-02-16',
    endDate: '2026-02-17',
    reason: 'Personal appointment',
  },
  {
    key: 'ethan-2026-feb',
    employeeKey: 'ethan-jackson',
    type: 'leave',
    category: 'sick',
    startDate: '2026-02-23',
    endDate: '2026-02-24',
    reason: 'Flu recovery',
  },
  {
    key: 'mason-2026-mar',
    employeeKey: 'mason-graham',
    type: 'leave',
    category: 'casual',
    startDate: '2026-03-09',
    endDate: '2026-03-10',
    reason: 'Home appointment',
  },
  {
    key: 'freya-2026-mar',
    employeeKey: 'freya-reed',
    type: 'leave',
    category: 'casual',
    startDate: '2026-03-16',
    endDate: '2026-03-17',
    reason: 'Family matter',
  },
  {
    key: 'lucas-2026-apr',
    employeeKey: 'lucas-lawson',
    type: 'leave',
    category: 'personal',
    startDate: '2026-04-13',
    endDate: '2026-04-14',
    reason: 'Family matter',
  },
  {
    key: 'ruby-2026-apr',
    employeeKey: 'ruby-walker',
    type: 'leave',
    category: 'sick',
    startDate: '2026-04-20',
    endDate: '2026-04-21',
    reason: 'Medical appointment',
  },
  {
    key: 'ruby-2026-easter',
    employeeKey: 'ruby-walker',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-04-02',
    endDate: '2026-04-07',
    reason: 'Easter break (Good Friday and Easter Monday do not count)',
  },
  {
    key: 'amelia-2026-feb',
    employeeKey: 'amelia-bennett',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-02-02',
    endDate: '2026-03-13',
    reason: 'Extended winter break (over allowance, deliberately confirmed)',
    confirmOverAllowance: true,
  },
  {
    key: 'mia-2026-jan',
    employeeKey: 'mia-knight',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-01-05',
    endDate: '2026-02-04',
    reason: 'Annual leave (first half of the exact 28-day case)',
  },
  {
    key: 'lucas-2026-jan',
    employeeKey: 'lucas-lawson',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-01-05',
    endDate: '2026-01-09',
    reason: 'Annual leave (January only)',
  },
  {
    key: 'lucas-2026-oct',
    employeeKey: 'lucas-lawson',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-10-05',
    endDate: '2026-10-09',
    reason: 'Annual leave (October only)',
  },
  {
    key: 'ethan-2026-jan',
    employeeKey: 'ethan-jackson',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-01-12',
    endDate: '2026-01-16',
    reason: 'Annual leave (January only)',
  },
  {
    key: 'ethan-2026-oct',
    employeeKey: 'ethan-jackson',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-10-12',
    endDate: '2026-10-16',
    reason: 'Annual leave (October only)',
  },
  {
    key: 'grace-2026-may',
    employeeKey: 'grace-morgan',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-05-04',
    endDate: '2026-05-06',
    reason: 'Annual leave (the 4 May bank holiday does not count)',
  },
  {
    key: 'amelia-2026-jun',
    employeeKey: 'amelia-bennett',
    type: 'time_off',
    category: null,
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    reason: 'Personal appointment',
  },
  {
    key: 'grace-2026-jun',
    employeeKey: 'grace-morgan',
    type: 'time_off',
    category: null,
    startDate: '2026-06-15',
    endDate: '2026-06-16',
    reason: 'Family matter',
  },
  {
    key: 'henry-2026-jun',
    employeeKey: 'henry-young',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-06-22',
    endDate: '2026-06-26',
    reason: 'Annual leave',
  },
  {
    key: 'noah-2026-jul',
    employeeKey: 'noah-carter',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-07-06',
    endDate: '2026-07-10',
    reason: 'Annual leave',
  },
  {
    key: 'jack-2026-jul',
    employeeKey: 'jack-shaw',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-07-13',
    endDate: '2026-07-14',
    reason: 'Annual leave',
  },
  {
    key: 'ruby-2026-jul',
    employeeKey: 'ruby-walker',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-07-13',
    endDate: '2026-07-17',
    reason: 'Annual leave',
  },
  {
    key: 'olivia-2026-jul',
    employeeKey: 'olivia-irwin',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-07-20',
    endDate: '2026-07-24',
    reason: 'Annual leave',
  },
  {
    key: 'chloe-2026-jul',
    employeeKey: 'chloe-owen',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-07-27',
    endDate: '2026-07-31',
    reason: 'Annual leave',
  },
  {
    key: 'sophia-2026-aug',
    employeeKey: 'sophia-foster',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-08-03',
    endDate: '2026-08-07',
    reason: 'Annual leave',
  },
  {
    key: 'mia-2026-aug',
    employeeKey: 'mia-knight',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-08-10',
    endDate: '2026-08-14',
    reason: 'Annual leave',
  },
  {
    key: 'maya-2026-aug',
    employeeKey: 'maya-patel',
    type: 'leave',
    category: 'casual',
    startDate: '2026-08-17',
    endDate: '2026-08-18',
    reason: 'Home appointment',
  },
  {
    key: 'archie-2026-aug',
    employeeKey: 'archie-quinn',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-08-24',
    endDate: '2026-08-28',
    reason: 'Annual leave',
  },
  {
    key: 'ella-2026-sep',
    employeeKey: 'ella-turner',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-09-07',
    endDate: '2026-09-11',
    reason: 'Annual leave',
  },
  {
    key: 'oliver-2026-sep',
    employeeKey: 'oliver-grant',
    type: 'leave',
    category: 'sick',
    startDate: '2026-09-14',
    endDate: '2026-09-15',
    reason: 'Medical appointment',
  },
  {
    key: 'theo-2026-sep',
    employeeKey: 'theo-cooper',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-09-21',
    endDate: '2026-09-25',
    reason: 'Annual leave',
  },
  {
    key: 'olivia-2026-oct',
    employeeKey: 'olivia-irwin',
    type: 'leave',
    category: 'casual',
    startDate: '2026-10-05',
    endDate: '2026-10-06',
    reason: 'Home appointment',
  },
  {
    key: 'ava-2026-oct',
    employeeKey: 'ava-hughes',
    type: 'leave',
    category: 'sick',
    startDate: '2026-10-12',
    endDate: '2026-10-13',
    reason: 'Flu recovery',
  },
  {
    key: 'mason-2026-oct',
    employeeKey: 'mason-graham',
    type: 'time_off',
    category: null,
    startDate: '2026-10-14',
    endDate: '2026-10-14',
    reason: 'Personal appointment',
  },
  {
    key: 'amelia-2026-oct-future',
    employeeKey: 'amelia-bennett',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-10-21',
    endDate: '2026-10-23',
    reason: 'Annual leave booked beyond the remaining allowance (confirmed)',
    confirmOverAllowance: true,
  },
  {
    key: 'noah-2026-oct-future',
    employeeKey: 'noah-carter',
    type: 'time_off',
    category: null,
    startDate: '2026-10-21',
    endDate: '2026-10-22',
    reason: 'Personal appointment',
  },
  {
    key: 'isla-2026-dec',
    employeeKey: 'isla-dawson',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-12-21',
    endDate: '2026-12-23',
    reason: 'Annual leave',
  },
] as const;

export const SEED_HISTORY_APPROVED_LEAVES: readonly LeavePlan[] = [
  ...SEED_2025_APPROVED_LEAVES,
  ...SEED_2026_APPROVED_LEAVES,
] as const;

export const SEED_2025_PENDING_LEAVES: readonly LeavePlan[] = [
  {
    key: 'noah-pending',
    type: 'leave',
    category: 'casual',
    startDate: '2025-04-22',
    endDate: '2025-04-23',
    reason: 'Home appointment',
  },
  {
    key: 'mia-pending',
    type: 'time_off',
    category: null,
    startDate: '2025-06-03',
    endDate: '2025-06-03',
    reason: 'Personal appointment',
  },
  {
    key: 'ava-pending',
    type: 'leave',
    category: 'personal',
    startDate: '2025-10-06',
    endDate: '2025-10-07',
    reason: 'Family matter',
  },
  {
    key: 'jack-pending',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-11-17',
    endDate: '2025-11-18',
    reason: 'Annual leave',
  },
  {
    key: 'theo-pending',
    type: 'leave',
    category: 'casual',
    startDate: '2025-11-04',
    endDate: '2025-11-04',
    reason: 'Home appointment',
  },
  {
    key: 'ella-pending',
    type: 'leave',
    category: 'sick',
    startDate: '2025-12-08',
    endDate: '2025-12-09',
    reason: 'Medical appointment',
  },
] as const;

export const SEED_2025_REJECTED_LEAVES: readonly LeavePlan[] = [
  {
    key: 'isla-rejected',
    type: 'leave',
    category: 'casual',
    startDate: '2025-02-03',
    endDate: '2025-02-04',
    reason: 'Personal appointment',
  },
  {
    key: 'lucas-rejected',
    type: 'vacation',
    category: 'annual',
    startDate: '2025-04-07',
    endDate: '2025-04-08',
    reason: 'Annual leave',
  },
  {
    key: 'grace-rejected',
    type: 'time_off',
    category: null,
    startDate: '2025-08-12',
    endDate: '2025-08-13',
    reason: 'Family matter',
  },
  {
    key: 'henry-rejected',
    type: 'leave',
    category: 'personal',
    startDate: '2025-10-27',
    endDate: '2025-10-28',
    reason: 'Home appointment',
  },
] as const;

export const SEED_2026_PENDING_LEAVES: readonly LeavePlan[] = [
  {
    key: 'noah-2026-pending',
    employeeKey: 'noah-carter',
    type: 'leave',
    category: 'casual',
    startDate: '2026-02-16',
    endDate: '2026-02-17',
    reason: 'Home appointment',
  },
  {
    key: 'mia-2026-pending',
    employeeKey: 'mia-knight',
    type: 'time_off',
    category: null,
    startDate: '2026-06-03',
    endDate: '2026-06-03',
    reason: 'Personal appointment',
  },
  {
    key: 'ava-2026-pending',
    employeeKey: 'ava-hughes',
    type: 'leave',
    category: 'personal',
    startDate: '2026-11-09',
    endDate: '2026-11-10',
    reason: 'Family matter',
  },
  {
    key: 'theo-2026-pending',
    employeeKey: 'theo-cooper',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    reason: 'Annual leave request still pending',
  },
] as const;

export const SEED_2026_REJECTED_LEAVES: readonly LeavePlan[] = [
  {
    key: 'isla-2026-rejected',
    employeeKey: 'isla-dawson',
    type: 'leave',
    category: 'casual',
    startDate: '2026-03-23',
    endDate: '2026-03-24',
    reason: 'Personal appointment',
  },
  {
    key: 'lucas-2026-rejected',
    employeeKey: 'lucas-lawson',
    type: 'vacation',
    category: 'annual',
    startDate: '2026-08-10',
    endDate: '2026-08-11',
    reason: 'Annual leave',
  },
] as const;

export const SEED_HISTORY_PENDING_LEAVES: readonly LeavePlan[] = [
  ...SEED_2025_PENDING_LEAVES,
  ...SEED_2026_PENDING_LEAVES,
] as const;

export const SEED_HISTORY_REJECTED_LEAVES: readonly LeavePlan[] = [
  ...SEED_2025_REJECTED_LEAVES,
  ...SEED_2026_REJECTED_LEAVES,
] as const;

export interface AllowancePlan {
  employeeKey: string;
  year: number;
  allowance: number;
  note: string;
}

const ALLOWANCE_2026_OVERRIDES: Record<string, { allowance?: number; note?: string }> = {
  'amelia-bennett': {
    note: 'The 2026 booked leave deliberately goes over the 28-day allowance.',
  },
  'oliver-grant': {
    allowance: 21,
    note: '21 days set for a 2026 mid-year start (pro-rata applied by the administrator).',
  },
};

/**
 * Allowance rows that go beyond the environment default.
 *
 * 2026 has a row for every employee so the overview, the profile and the CSV
 * exercise real stored values (28 days unless the employee has an override).
 * There is no carry-over: unused days expire on 31 December and each calendar
 * year starts from its own allowance. The three 2025 rows are pro-rata
 * allowances for mid-year hires; they are stored values, never recalculated by
 * the application.
 */
export const SEED_HISTORY_ALLOWANCES: readonly AllowancePlan[] = [
  {
    employeeKey: 'evie-barker',
    year: 2025,
    allowance: 25.5,
    note: 'Pro-rata allowance for a February 2025 start.',
  },
  {
    employeeKey: 'theo-cooper',
    year: 2025,
    allowance: 14,
    note: 'Pro-rata allowance for a July 2025 start.',
  },
  {
    employeeKey: 'ava-hughes',
    year: 2025,
    allowance: 9.5,
    note: 'Pro-rata allowance for a September 2025 start.',
  },
  ...SEED_HISTORY_EMPLOYEES.map((employee) => {
    const override = ALLOWANCE_2026_OVERRIDES[employee.key];
    return {
      employeeKey: employee.key,
      year: 2026,
      allowance: override?.allowance ?? 28,
      note: override?.note ?? '',
    };
  }),
];

interface LeaveInfo {
  id: string;
  key: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  category: string | null;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveStatus;
  reason: string;
}

export interface SeedEmployeeRecord {
  id: string;
  key: string;
  name: string;
  email: string | null;
  phone: string;
  departmentId: string;
  departmentName: string;
  position: string;
  hireDate: string;
  status: 'active' | 'inactive' | 'terminated';
  profile: BehaviourProfile;
  leftDate: string | null;
}

export interface SeedEventRecord {
  id: string;
  title: string;
  description: string;
  type: EventType;
  startDate: string;
  endDate: string;
  edgeCases: string[];
}

export interface SeedMonthStat {
  month: string;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  vacation: number;
  notMarked: number;
  expectedSlots: number;
  futureLeaveRows: number;
}

export interface SeedYearTotals {
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  vacation: number;
  notMarked: number;
  expectedSlots: number;
  recorded: number;
  futureLeaveRows: number;
}

export interface SeedYearStat {
  year: number;
  months: number;
  totals: SeedYearTotals;
  statusShares: {
    present: number;
    late: number;
    absent: number;
    onLeave: number;
    vacation: number;
  };
  countedMix: {
    present: number;
    late: number;
    absent: number;
  };
  notMarkedShare: number;
}

export interface SeedTopCheck {
  month: string;
  expected: TopEmployee[];
  actual: TopEmployee[];
  matches: boolean;
}

export interface SeedDashboardYearCheck {
  year: number;
  matches: boolean;
  months: number;
  attendance: number;
  absence: number;
  leave: number;
}

export interface SeedAllowanceCheck {
  employeeId: string;
  name: string;
  year: number;
  allowance: number;
  total: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface SeedVerification {
  assertions: string[];
  allowanceChecks: SeedAllowanceCheck[];
  months: SeedMonthStat[];
  years: SeedYearStat[];
  overallTotals: SeedYearTotals;
  notMarkedShare: number;
  eventCounts: Record<EventType, number>;
  eventCountsByYear: Record<string, Record<EventType, number>>;
  eventsByMonth: Array<Record<EventType, number> & { month: string; total: number }>;
  multiDayEvents: SeedEventRecord[];
  edgeCaseEvents: SeedEventRecord[];
  topChecks: SeedTopCheck[];
  dashboardYears: SeedDashboardYearCheck[];
  dashboardToday: {
    date: string;
    matches: boolean;
    totalEmployees: number;
    notMarked: number;
    expectedNotMarked: number;
    onLeave: number;
  };
  attendanceSheet: {
    lastMarkedDate: string;
    lastMarkedRows: number;
    lastMarkedManualRows: number;
    nextDayDate: string;
    nextDayRows: number;
    nextDayLeaveSyncRows: number;
    nextDayManualRows: number;
  };
  futureLeaveRows: number;
  october2026: {
    lastMarked: string;
    markedWorkingDays: number;
    fullWorkingDays: number;
  };
  holidayLeaves: LeaveInfo[];
}

export interface SeedHistoryResult {
  checksum: string;
  adminId: string;
  resetDeleted: Record<string, number>;
  counts: {
    departments: number;
    employees: number;
    activeEmployees: number;
    inactiveEmployees: number;
    terminatedEmployees: number;
    newHires: number;
    newHires2025: number;
    newHires2026: number;
    attendance: number;
    manualAttendance: number;
    leaveAttendance: number;
    futureLeaveRows: number;
    expectedSlots: number;
    deliberatelyUnmarked: number;
    approvedLeaves: number;
    approvedLeaves2025: number;
    approvedLeaves2026: number;
    approvedLeavesAfterCutoff: number;
    pendingLeaves: number;
    rejectedLeaves: number;
    overtime: number;
    overtime2025: number;
    overtime2026: number;
    events: number;
    events2025: number;
    events2026: number;
    leaveAllowances: number;
  };
  employees: SeedEmployeeRecord[];
  approvedLeaves: LeaveInfo[];
  pendingLeaves: LeaveInfo[];
  rejectedLeaves: LeaveInfo[];
  events: SeedEventRecord[];
  verification: SeedVerification;
}

/** The collections `--reset` may delete. Admins and sessions are never included. */
export const SEED_HISTORY_RESET_COLLECTIONS = [
  'attendance',
  'overtime',
  'leaves',
  'leaveallowances',
  'events',
  'employees',
  'departments',
] as const;

export async function resetSeedCollections(): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  deleted.attendance = (await AttendanceModel.deleteMany({})).deletedCount ?? 0;
  deleted.overtime = (await OvertimeModel.deleteMany({})).deletedCount ?? 0;
  deleted.leaves = (await LeaveModel.deleteMany({})).deletedCount ?? 0;
  deleted.leaveallowances = (await LeaveAllowanceModel.deleteMany({})).deletedCount ?? 0;
  deleted.events = (await EventModel.deleteMany({})).deletedCount ?? 0;
  deleted.employees = (await EmployeeModel.deleteMany({})).deletedCount ?? 0;
  deleted.departments = (await DepartmentModel.deleteMany({})).deletedCount ?? 0;

  return deleted;
}

/** Extract the database name from a Mongo connection string without exposing credentials. */
export function databaseNameFromUri(uri: string): string {
  const withoutQuery = uri.split('?')[0] ?? '';
  const schemeEnd = withoutQuery.indexOf('://');
  const afterScheme = schemeEnd >= 0 ? withoutQuery.slice(schemeEnd + 3) : withoutQuery;
  const slash = afterScheme.indexOf('/');

  if (slash === -1) return '';

  try {
    return decodeURIComponent(afterScheme.slice(slash + 1));
  } catch {
    return '';
  }
}

/** The seed's database-name safety rule. */
export function isSafeSeedDatabaseName(name: string): boolean {
  return /test|demo/i.test(name);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function timeString(totalMinutes: number): string {
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function lastWorkingDayOfMonth(year: number, month: number): string {
  let date = monthBounds(year, month).end;

  while (isoWeekday(date) > 5 || isEnglandBankHoliday(date)) {
    date = addDays(date, -1);
  }

  return date;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): string {
  let date = `${year}-${pad(month)}-01`;
  let seen = 0;

  while (Number(date.slice(0, 4)) === year && Number(date.slice(5, 7)) === month) {
    if (isoWeekday(date) === weekday) {
      seen += 1;
      if (seen === nth) return date;
    }
    date = addDays(date, 1);
  }

  throw new Error(`Could not find weekday ${weekday} number ${nth} in ${year}-${pad(month)}`);
}

function nextWorkingDay(date: string): string {
  let next = date;

  while (!isWorkingDay(next) || isEnglandBankHoliday(next)) {
    next = addDays(next, 1);
  }

  return next;
}

function addMonthsClamped(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const last = Number(monthBounds(targetYear, targetMonth).end.slice(8, 10));
  return `${targetYear}-${pad(targetMonth)}-${pad(Math.min(day, last))}`;
}

function makeSeededRandom(seed: number) {
  let state = seed;

  return {
    next(): number {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    pick<T>(values: readonly T[]): T {
      return values[Math.floor(this.next() * values.length)] as T;
    },
  };
}

type SeededRandom = ReturnType<typeof makeSeededRandom>;

function weightedPick<T>(random: SeededRandom, values: readonly T[], weight: (value: T) => number): T {
  const total = values.reduce((sum, value) => sum + weight(value), 0);
  let roll = random.next() * total;

  for (const value of values) {
    roll -= weight(value);
    if (roll <= 0) return value;
  }

  return values[values.length - 1] as T;
}

/**
 * Stable profiles for the whole two-year history. The run counts are roughly
 * doubled compared with a single year, keeping the annual absence rate in the
 * same range while the late chance stays constant across both years.
 */
const PROFILE_CONFIG: Record<
  BehaviourProfile,
  { lateChance: number; absenceRuns: [number, number] }
> = {
  reliable: { lateChance: 0.035, absenceRuns: [2, 3] },
  average: { lateChance: 0.08, absenceRuns: [6, 8] },
  oftenLate: { lateChance: 0.2, absenceRuns: [4, 5] },
  highAbsence: { lateChance: 0.035, absenceRuns: [20, 24] },
};

const ABSENCE_NOTES = ['Sick', 'Medical appointment', 'Family emergency', 'Personal matter'] as const;
const LATE_NOTES = ['Train delay', 'Roadworks', 'School run', 'Client call', 'Medical appointment'] as const;
const OVERTIME_NOTES = ['Month-end close', 'Client deadline', 'Stock take', 'System release', 'Event support', ''] as const;

function monthWeight(date: string): number {
  const month = Number(date.slice(5, 7));
  if (month <= 2) return 4;
  if (month <= 4) return 1.6;
  if (month <= 6) return 1.1;
  if (month <= 8) return 1;
  if (month <= 10) return 1.2;
  return 1.6;
}

function newEventCounts(): Record<EventType, number> {
  return { holiday: 0, deadline: 0, meeting: 0, event: 0 };
}

interface EventSeed {
  title: string;
  description: string;
  type: EventType;
  startDate: string;
  endDate: string;
}

function makeEventSeeds(): EventSeed[] {
  const events: EventSeed[] = [];

  function add(
    title: string,
    type: EventType,
    startDate: string,
    endDate: string,
    description: string,
  ): void {
    if (endDate < startDate) {
      throw new Error(`Event "${title}" ends before it starts.`);
    }
    events.push({ title, type, startDate, endDate, description });
  }

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const holidays: Record<number, Array<{ title: string; date: string }>> = {
    2025: [
      { title: "New Year's Day", date: '2025-01-01' },
      { title: 'Good Friday', date: '2025-04-18' },
      { title: 'Easter Monday', date: '2025-04-21' },
      { title: 'Early May bank holiday', date: '2025-05-05' },
      { title: 'Spring bank holiday', date: '2025-05-26' },
      { title: 'Summer bank holiday', date: '2025-08-25' },
      { title: 'Christmas Day', date: '2025-12-25' },
      { title: 'Boxing Day', date: '2025-12-26' },
    ],
    2026: [
      { title: "New Year's Day", date: '2026-01-01' },
      { title: 'Good Friday', date: '2026-04-03' },
      { title: 'Easter Monday', date: '2026-04-06' },
      { title: 'Early May bank holiday', date: '2026-05-04' },
      { title: 'Spring bank holiday', date: '2026-05-25' },
      { title: 'Summer bank holiday', date: '2026-08-31' },
      { title: 'Christmas Day', date: '2026-12-25' },
      { title: 'Boxing Day substitute', date: '2026-12-28' },
    ],
  };

  // ---- holidays ---------------------------------------------------------
  for (const year of [2025, 2026] as const) {
    for (const holiday of holidays[year]) {
      add(
        holiday.title,
        'holiday',
        holiday.date,
        holiday.date,
        'England bank holiday. The office is closed.',
      );
    }
    add(
      'Christmas office closure',
      'holiday',
      `${year}-12-29`,
      `${year}-12-31`,
      `The office is closed for the last three days of ${year}.`,
    );
  }

  // ---- deadlines --------------------------------------------------------
  for (const year of [2025, 2026] as const) {
    for (let month = 1; month <= 12; month += 1) {
      const date = lastWorkingDayOfMonth(year, month);
      add(
        'Attendance sheets must be complete',
        'deadline',
        date,
        date,
        `Complete all attendance records for ${monthNames[month - 1]} ${year}.`,
      );
    }

    add(
      'Leave plan submission',
      'deadline',
      `${year}-03-31`,
      `${year}-04-02`,
      `Submit the Q2 ${year} team leave plan during the quarter-end window.`,
    );
    add(
      'Leave plan submission',
      'deadline',
      `${year}-06-30`,
      `${year}-07-02`,
      `Submit the Q3 ${year} team leave plan during the quarter-end window.`,
    );
    add(
      'Leave plan submission',
      'deadline',
      `${year}-09-30`,
      `${year}-10-02`,
      `Submit the Q4 ${year} team leave plan during the quarter-end window.`,
    );
    add(
      'Leave plan submission',
      'deadline',
      `${year}-12-30`,
      `${year}-12-31`,
      `Submit the Q1 ${year + 1} team leave plan before the year-end closure.`,
    );
    add(
      'Annual leave requests deadline',
      'deadline',
      `${year}-11-30`,
      `${year}-11-30`,
      'Submit remaining annual leave requests for the current holiday year.',
    );

    for (const employee of SEED_HISTORY_EMPLOYEES.filter((entry) =>
      entry.hireDate.startsWith(`${year}-`),
    )) {
      const date = addMonthsClamped(employee.hireDate, 3);
      add(
        `Probation review due: ${employee.name}`,
        'deadline',
        date,
        date,
        'Complete the three-month probation review.',
      );
    }
  }

  add(
    'Policy acknowledgement deadline',
    'deadline',
    '2025-11-14',
    '2025-11-14',
    'Confirm that you have read the updated staff handbook.',
  );
  add(
    'Policy acknowledgement deadline',
    'deadline',
    '2026-11-13',
    '2026-11-13',
    'Confirm that you have read the updated staff handbook.',
  );

  // ---- meetings ---------------------------------------------------------
  for (const year of [2025, 2026] as const) {
    for (let month = 1; month <= 12; month += 1) {
      const firstMonday = nthWeekdayOfMonth(year, month, 1, 1);
      const date = nextWorkingDay(firstMonday);
      add('HR team meeting', 'meeting', date, date, 'Monthly HR team meeting.');
    }

    for (let month = 1; month <= 12; month += 1) {
      const secondThursday = nthWeekdayOfMonth(year, month, 4, 2);
      const date = nextWorkingDay(secondThursday);
      add(
        'Attendance review',
        'meeting',
        date,
        date,
        'Review the previous month of attendance exceptions.',
      );
    }

    for (const date of [`${year}-01-15`, `${year}-04-16`, `${year}-07-16`, `${year}-10-15`]) {
      add(
        'Department heads review',
        'meeting',
        date,
        date,
        'Quarterly review with department heads.',
      );
    }

    add(
      'All-hands meeting',
      'meeting',
      year === 2025 ? '2025-06-25' : '2026-06-24',
      year === 2025 ? '2025-06-25' : '2026-06-24',
      'Company-wide update and Q&A.',
    );
  }

  // ---- events -----------------------------------------------------------
  for (const year of [2025, 2026] as const) {
    add(
      'Spring staff survey',
      'event',
      year === 2025 ? '2025-04-07' : '2026-04-13',
      year === 2025 ? '2025-04-11' : '2026-04-17',
      'Complete the anonymous spring staff survey.',
    );
    add(
      'Health & safety training',
      'event',
      year === 2025 ? '2025-03-12' : '2026-03-11',
      year === 2025 ? '2025-03-12' : '2026-03-11',
      'Annual health and safety briefing.',
    );
    add(
      'Health & safety training',
      'event',
      year === 2025 ? '2025-06-18' : '2026-06-17',
      year === 2025 ? '2025-06-18' : '2026-06-17',
      'Annual health and safety briefing.',
    );
    add(
      'Health & safety training',
      'event',
      year === 2025 ? '2025-12-12' : '2026-12-11',
      year === 2025 ? '2025-12-12' : '2026-12-11',
      'Annual health and safety briefing.',
    );
    add(
      'Fire drill',
      'event',
      year === 2025 ? '2025-03-20' : '2026-03-19',
      year === 2025 ? '2025-03-20' : '2026-03-19',
      'Scheduled fire drill.',
    );
    add(
      'Fire drill',
      'event',
      year === 2025 ? '2025-09-18' : '2026-09-17',
      year === 2025 ? '2025-09-18' : '2026-09-17',
      'Scheduled fire drill.',
    );
    add(
      'Summer company day',
      'event',
      year === 2025 ? '2025-07-19' : '2026-07-18',
      year === 2025 ? '2025-07-19' : '2026-07-18',
      'A Saturday company day for staff and families.',
    );
    add(
      'Two-day leadership workshop',
      'event',
      year === 2025 ? '2025-05-13' : '2026-05-12',
      year === 2025 ? '2025-05-14' : '2026-05-13',
      'Leadership workshop for team leads.',
    );
    add(
      'Autumn away day',
      'event',
      year === 2025 ? '2025-10-22' : '2026-10-21',
      year === 2025 ? '2025-10-22' : '2026-10-21',
      'Team planning and away day.',
    );
    add(
      'Christmas party',
      'event',
      year === 2025 ? '2025-12-12' : '2026-12-11',
      year === 2025 ? '2025-12-12' : '2026-12-11',
      'Company Christmas party after work.',
    );
    add(
      'Year-end review',
      'event',
      year === 2025 ? '2025-12-19' : '2026-12-18',
      year === 2025 ? '2025-12-19' : '2026-12-18',
      'Review the year and confirm priorities for January.',
    );
    add(
      'Spring clock change',
      'event',
      year === 2025 ? '2025-03-30' : '2026-03-29',
      year === 2025 ? '2025-03-30' : '2026-03-29',
      'Clocks go forward at 01:00. Date-only HR records keep the same date.',
    );
    add(
      'Autumn clock change',
      'event',
      year === 2025 ? '2025-10-26' : '2026-10-25',
      year === 2025 ? '2025-10-26' : '2026-10-25',
      'Clocks go back at 02:00. Date-only HR records keep the same date.',
    );

    for (const employee of SEED_HISTORY_EMPLOYEES.filter((entry) =>
      entry.hireDate.startsWith(`${year}-`),
    )) {
      add(
        `New starter induction: ${employee.name}`,
        'event',
        employee.hireDate,
        employee.hireDate,
        'Induction and system access setup.',
      );
    }
  }

  return events;
}

async function loadLeaveInfo(
  plans: readonly LeavePlan[],
  idsByKey: Map<string, string>,
  employeeById: Map<string, SeedEmployeeRecord>,
): Promise<LeaveInfo[]> {
  const ids = [...idsByKey.values()].map((id) => new Types.ObjectId(id));
  const rows = await LeaveModel.find({ _id: { $in: ids } })
    .select('employeeId type category startDate endDate days status reason')
    .lean();

  const rowById = new Map(rows.map((row) => [String(row._id), row]));

  return plans.map((plan) => {
    const id = idsByKey.get(plan.key);
    const row = id ? rowById.get(id) : undefined;
    const employee = row ? employeeById.get(String(row.employeeId)) : undefined;

    if (!row || !employee) {
      throw new Error(`Could not reload leave ${plan.key}.`);
    }

    return {
      id: String(row._id),
      key: plan.key,
      employeeId: String(row.employeeId),
      employeeName: employee.name,
      type: row.type as LeaveType,
      category: (row.category as string | null) ?? null,
      startDate: row.startDate,
      endDate: row.endDate,
      days: row.days,
      status: row.status as LeaveStatus,
      reason: row.reason ?? '',
    };
  });
}

/**
 * The days on which this employee should have a manual attendance record.
 *
 * The history deliberately stops on `SEED_HISTORY_LAST_MARKED`; approved
 * future leaves may still create `leave_sync` rows after that date. Nothing is
 * generated for an employee after their leaving/deactivation date.
 */
function employeeExpectedDates(employee: SeedEmployeeRecord): string[] {
  const start = employee.hireDate > SEED_HISTORY_START ? employee.hireDate : SEED_HISTORY_START;
  const end =
    employee.leftDate && employee.leftDate < SEED_HISTORY_LAST_MARKED
      ? employee.leftDate
      : SEED_HISTORY_LAST_MARKED;

  if (end < start) return [];

  return workingDaysBetween(start, end).filter((date) => !isEnglandBankHoliday(date));
}

function keyFor(employeeId: string, date: string): string {
  return `${employeeId}|${date}`;
}

function eventEdgeCases(
  events: SeedEventRecord[],
  approvedLeaves: LeaveInfo[],
): SeedEventRecord[] {
  const startCounts = new Map<string, number>();
  const leaveDates = new Set<string>();

  for (const event of events) {
    startCounts.set(event.startDate, (startCounts.get(event.startDate) ?? 0) + 1);
  }

  for (const leave of approvedLeaves) {
    for (const date of eachDate(leave.startDate, leave.endDate)) {
      leaveDates.add(date);
    }
  }

  return events.map((event) => {
    const edgeCases: string[] = [];

    if (event.endDate > event.startDate) edgeCases.push('multi-day');
    if (event.startDate.slice(0, 7) !== event.endDate.slice(0, 7)) edgeCases.push('month-boundary');
    if (event.title === 'Christmas office closure') edgeCases.push('christmas-closure');
    if (isoWeekday(event.startDate) === 6) edgeCases.push('saturday');
    if ((startCounts.get(event.startDate) ?? 0) > 1) edgeCases.push('same-day');
    if (
      ['2025-03-30', '2025-10-26', '2026-03-29', '2026-10-25'].includes(event.startDate)
    ) {
      edgeCases.push('clock-change');
    }
    if (leaveDates.has(event.startDate)) edgeCases.push('leave-day');

    return { ...event, edgeCases };
  });
}

async function rawTopEmployees(
  month: string,
  employees: SeedEmployeeRecord[],
): Promise<TopEmployee[]> {
  const bounds = monthBounds(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const rows = await AttendanceModel.find({
    date: { $gte: bounds.start, $lte: bounds.end },
    status: { $in: ['present', 'late', 'absent'] },
  })
    .select('employeeId status')
    .lean();

  const activeById = new Map(
    employees.filter((employee) => employee.status === 'active').map((employee) => [employee.id, employee]),
  );
  const byEmployee = new Map<
    string,
    { present: number; late: number; absent: number; employee: SeedEmployeeRecord }
  >();

  for (const row of rows) {
    const employeeId = String(row.employeeId);
    const employee = activeById.get(employeeId);
    if (!employee) continue;

    const entry = byEmployee.get(employeeId) ?? {
      present: 0,
      late: 0,
      absent: 0,
      employee,
    };

    if (row.status === 'present') entry.present += 1;
    if (row.status === 'late') entry.late += 1;
    if (row.status === 'absent') entry.absent += 1;
    byEmployee.set(employeeId, entry);
  }

  return [...byEmployee.values()]
    .map((entry) => ({
      employeeId: entry.employee.id,
      name: entry.employee.name,
      position: entry.employee.position,
      department: entry.employee.departmentName,
      present: entry.present,
      late: entry.late,
      absent: entry.absent,
      score: entry.present * 3 - entry.late - entry.absent * 2,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.absent !== b.absent) return a.absent - b.absent;
      if (b.present !== a.present) return b.present - a.present;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 5);
}

function sameTopEmployees(a: TopEmployee[], b: TopEmployee[]): boolean {
  if (a.length !== b.length) return false;

  return a.every((entry, index) => {
    const other = b[index];
    return (
      Boolean(other) &&
      entry.employeeId === other?.employeeId &&
      entry.name === other?.name &&
      entry.position === other?.position &&
      entry.department === other?.department &&
      entry.present === other?.present &&
      entry.late === other?.late &&
      entry.absent === other?.absent &&
      entry.score === other?.score
    );
  });
}

async function verifySeedData(
  employees: SeedEmployeeRecord[],
  approvedLeaves: LeaveInfo[],
  pendingLeaves: LeaveInfo[],
  rejectedLeaves: LeaveInfo[],
  events: SeedEventRecord[],
  deliberatelyUnmarked: number,
): Promise<SeedVerification> {
  const assertions: string[] = [];
  const attendance = await AttendanceModel.find().lean();
  const overtime = await OvertimeModel.find().lean();
  const eventRows = await EventModel.find().lean();
  const employeeRows = await EmployeeModel.find().select('name email status hireDate photo').lean();
  const allowanceRows = await LeaveAllowanceModel.find().lean();

  function check(condition: boolean, label: string, detail: string): void {
    if (!condition) {
      throw new Error(`[seed:history] assertion failed (${label}): ${detail}`);
    }
    assertions.push(label);
  }

  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const approvedIds = new Set(approvedLeaves.map((leave) => leave.id));
  const pendingIds = new Set(pendingLeaves.map((leave) => leave.id));
  const rejectedIds = new Set(rejectedLeaves.map((leave) => leave.id));
  const holidayEventDates = new Set<string>();
  for (const event of eventRows) {
    if (event.type !== 'holiday') continue;
    for (const date of eachDate(event.startDate, event.endDate)) holidayEventDates.add(date);
  }
  const attendanceByKey = new Map<string, (typeof attendance)[number]>();
  const duplicateKeys = new Set<string>();
  const leaveStatus: Record<string, number> = {
    present: 0,
    late: 0,
    absent: 0,
    on_leave: 0,
    vacation: 0,
  };

  for (const row of attendance) {
    const key = `${String(row.employeeId)}|${row.date}`;
    if (attendanceByKey.has(key)) duplicateKeys.add(key);
    attendanceByKey.set(key, row);
    leaveStatus[row.status] = (leaveStatus[row.status] ?? 0) + 1;
  }

  check(duplicateKeys.size === 0, 'attendance-unique', `${duplicateKeys.size} duplicate employee/date key(s)`);

  const employeesWithPhotos = employeeRows.filter((employee) => Boolean(employee.photo?.data));
  check(employeeRows.length === 26, 'employee-count', `${employeeRows.length} employees`);
  check(employeesWithPhotos.length === 0, 'employee-no-photos', `${employeesWithPhotos.length} employee(s) have photos`);

  const activeEmployees = employees.filter((employee) => employee.status === 'active');
  const inactiveEmployees = employees.filter((employee) => employee.status === 'inactive');
  const terminatedEmployees = employees.filter((employee) => employee.status === 'terminated');
  check(activeEmployees.length >= 20, 'active-employee-minimum', `${activeEmployees.length} active employees`);
  check(inactiveEmployees.length === 1, 'inactive-employee', `${inactiveEmployees.length} inactive employees`);
  check(terminatedEmployees.length === 2, 'terminated-employees', `${terminatedEmployees.length} terminated employees`);
  check(
    employees.filter((employee) => employee.hireDate.startsWith('2025-')).length === 3,
    '2025-new-hires',
    'expected exactly three employees hired during 2025',
  );
  check(
    employees.filter((employee) => employee.hireDate.startsWith('2026-')).length === 2,
    '2026-new-hires',
    'expected exactly two employees hired during 2026',
  );
  check(
    [...inactiveEmployees, ...terminatedEmployees].every((employee) => Boolean(employee.leftDate)),
    'leavers-have-dates',
    'an inactive/terminated employee has no leaving/deactivation date',
  );

  const departmentCounts = new Map<string, number>();
  for (const employee of employees) {
    departmentCounts.set(employee.departmentName, (departmentCounts.get(employee.departmentName) ?? 0) + 1);
  }
  check(departmentCounts.size === 5, 'department-count', `${departmentCounts.size} departments`);
  check(
    new Set(departmentCounts.values()).size > 1,
    'department-sizes-unequal',
    [...departmentCounts.entries()].map(([name, count]) => `${name}:${count}`).join(', '),
  );

  const emails = employees.map((employee) => employee.email).filter((email): email is string => Boolean(email));
  check(new Set(emails).size === emails.length, 'employee-emails-unique', 'duplicate employee email');
  check(employees.some((employee) => employee.email === null), 'employee-null-emails', 'no employee has an empty email');

  const allowanceKeys = allowanceRows.map((row) => `${String(row.employeeId)}|${row.year}`);
  const allowance2026 = allowanceRows.filter((row) => row.year === 2026);
  const allowance2025 = allowanceRows.filter((row) => row.year === 2025);
  const allowanceEmployee = (key: string, year: number) =>
    allowanceRows.find(
      (row) =>
        String(row.employeeId) === employees.find((employee) => employee.key === key)?.id &&
        row.year === year,
    );
  check(allowanceRows.length === 29, 'allowance-row-count', `${allowanceRows.length}`);
  check(
    new Set(allowanceKeys).size === allowanceRows.length,
    'allowance-employee-year-unique',
    'duplicate allowance row for one employee and year',
  );
  check(
    allowance2026.length === 26 && allowance2025.length === 3,
    'allowance-year-coverage',
    `2025=${allowance2025.length}, 2026=${allowance2026.length}`,
  );
  check(
    allowanceRows.every((row) => row.allowance >= 0 && row.allowance <= 100),
    'allowance-bounds',
    'an allowance is outside 0-100',
  );
  check(
    allowanceEmployee('oliver-grant', 2026)?.allowance === 21 &&
      allowanceEmployee('evie-barker', 2025)?.allowance === 25.5 &&
      allowanceEmployee('theo-cooper', 2025)?.allowance === 14 &&
      allowanceEmployee('ava-hughes', 2025)?.allowance === 9.5,
    'allowance-pro-rata-values',
    'the stored pro-rata/override allowances differ from the designed values',
  );
  check(
    allowanceRows.every((row) => !('carryOver' in row)),
    'allowance-no-carry-over',
    'an allowance row still has a carryOver field',
  );

  // The printed verification table uses the same counted dates as the app:
  // working days only, bank/company holidays skipped, split by actual year.
  const countedLeaveDaysInYear = (leave: LeaveInfo, year: number): number =>
    eachDate(leave.startDate, leave.endDate).filter(
      (date) =>
        Number(date.slice(0, 4)) === year && isWorkingDay(date) && !holidayEventDates.has(date),
    ).length;

  const allowanceUsage = (employeeId: string, leaves: LeaveInfo[], year: number): number => {
    let count = 0;
    for (const leave of leaves) {
      if (leave.employeeId !== employeeId || leave.type !== 'vacation') continue;
      count += countedLeaveDaysInYear(leave, year);
    }
    return count;
  };

  const allowanceChecks: SeedAllowanceCheck[] = [];
  for (const employee of employees) {
    for (const year of [2025, 2026]) {
      const row = allowanceRows.find(
        (candidate) => String(candidate.employeeId) === employee.id && candidate.year === year,
      );
      const allowance = row?.allowance ?? env.annualAllowanceDefault;
      const total = allowance;
      const used = allowanceUsage(employee.id, approvedLeaves, year);
      allowanceChecks.push({
        employeeId: employee.id,
        name: employee.name,
        year,
        allowance,
        total,
        used,
        pending: allowanceUsage(employee.id, pendingLeaves, year),
        remaining: total - used,
      });
    }
  }

  check(
    allowanceChecks.length === employees.length * 2,
    'allowance-check-coverage',
    `${allowanceChecks.length} employee/year row(s) for ${employees.length} employees`,
  );
  const allowanceCheck = (name: string, year: number) =>
    allowanceChecks.find((row) => row.name === name && row.year === year);
  const jack2025 = allowanceCheck('Jack Shaw', 2025);
  const theo2026 = allowanceCheck('Theo Cooper', 2026);
  check(
    jack2025?.pending === 2 && theo2026?.pending === 1,
    'allowance-pending-vacation-cases',
    `Jack Shaw 2025 pending=${jack2025?.pending}, Theo Cooper 2026 pending=${theo2026?.pending}`,
  );
  const mia2026 = allowanceCheck('Mia Knight', 2026);
  const amelia2025 = allowanceCheck('Amelia Bennett', 2025);
  const amelia2026 = allowanceCheck('Amelia Bennett', 2026);
  const harry2025 = allowanceCheck('Harry Nelson', 2025);
  const harry2026 = allowanceCheck('Harry Nelson', 2026);
  const noah2025 = allowanceCheck('Noah Carter', 2025);
  const noah2026 = allowanceCheck('Noah Carter', 2026);
  check(
    mia2026?.total === 28 && mia2026.used === 28 && mia2026.remaining === 0,
    'allowance-exact-28-case',
    `Mia Knight 2026: ${mia2026?.used}/${mia2026?.total}`,
  );
  check(
    harry2025?.total === 28 &&
      harry2025.used === 23 &&
      harry2025.remaining === 5 &&
      harry2026?.total === 28 &&
      harry2026.used === 0 &&
      harry2026.remaining === 28,
    'allowance-unused-expired-case',
    `Harry Nelson: 2025 ${harry2025?.used}/${harry2025?.total} = ${harry2025?.remaining}, ` +
      `2026 ${harry2026?.used}/${harry2026?.total} = ${harry2026?.remaining}`,
  );
  check(
    amelia2026?.total === 28 && amelia2026.used === 33 && amelia2026.remaining === -5,
    'allowance-negative-remaining-case',
    `Amelia Bennett 2026: ${amelia2026?.used}/${amelia2026?.total} = ${amelia2026?.remaining}`,
  );
  check(
    Boolean(amelia2025 && amelia2025.remaining > 0) &&
      Boolean(amelia2026 && amelia2026.remaining < 0) &&
      amelia2026?.total === 28,
    'allowance-no-prior-year-rescue',
    `Amelia Bennett: 2025 remaining=${amelia2025?.remaining}, 2026 remaining=${amelia2026?.remaining}`,
  );
  const noahCrossYear = approvedLeaves.find((leave) => leave.key === 'noah-dec');
  check(
    Boolean(noahCrossYear) &&
      countedLeaveDaysInYear(noahCrossYear!, 2025) === 3 &&
      countedLeaveDaysInYear(noahCrossYear!, 2026) === 1 &&
      noah2025?.used === 8 &&
      noah2026?.used === 6,
    'allowance-cross-year-split-case',
    `Noah Carter: cross-year 2025=${noahCrossYear ? countedLeaveDaysInYear(noahCrossYear, 2025) : '?'}, ` +
      `2026=${noahCrossYear ? countedLeaveDaysInYear(noahCrossYear, 2026) : '?'}; ` +
      `all vacation 2025=${noah2025?.used}, 2026=${noah2026?.used}`,
  );

  const manualRows = attendance.filter((row) => row.source === 'manual');
  const manualAfterCutoff = manualRows.filter((row) => row.date > SEED_HISTORY_LAST_MARKED);
  check(
    manualAfterCutoff.length === 0,
    'no-manual-attendance-after-cutoff',
    `${manualAfterCutoff.length} manual row(s) after ${SEED_HISTORY_LAST_MARKED}`,
  );

  const rowsAfterCutoff = attendance.filter((row) => row.date > SEED_HISTORY_LAST_MARKED);
  check(
    rowsAfterCutoff.every((row) => row.source === 'leave_sync'),
    'future-rows-are-leave-sync-only',
    `${rowsAfterCutoff.filter((row) => row.source !== 'leave_sync').length} non-leave row(s) after cutoff`,
  );

  const weekendRows = attendance.filter((row) => isoWeekday(row.date) > 5);
  check(weekendRows.length === 0, 'attendance-no-weekends', `${weekendRows.length} weekend row(s)`);

  const illegalHolidayRows = attendance.filter(
    (row) => isEnglandBankHoliday(row.date) && row.source !== 'leave_sync',
  );
  check(
    illegalHolidayRows.length === 0,
    'attendance-no-bank-holiday-manual',
    `${illegalHolidayRows.length} non-leave row(s) on a bank holiday`,
  );

  const outOfEmployment = attendance.filter((row) => {
    const employee = employeeById.get(String(row.employeeId));
    if (!employee) return true;
    if (row.date < employee.hireDate) return true;
    if (employee.leftDate && row.date > employee.leftDate) return true;
    return false;
  });
  check(
    outOfEmployment.length === 0,
    'attendance-employment-bounds',
    `${outOfEmployment.length} row(s) before hire or after leaving/deactivation`,
  );

  const invalidLeaveRows = attendance.filter(
    (row) => row.source === 'leave_sync' && (!row.leaveId || !approvedIds.has(String(row.leaveId))),
  );
  check(
    invalidLeaveRows.length === 0,
    'leave-sync-approved-only',
    `${invalidLeaveRows.length} leave_sync row(s) without an approved leaveId`,
  );

  const pendingOrRejectedRows = attendance.filter(
    (row) => row.leaveId && (pendingIds.has(String(row.leaveId)) || rejectedIds.has(String(row.leaveId))),
  );
  check(
    pendingOrRejectedRows.length === 0,
    'pending-rejected-no-attendance',
    `${pendingOrRejectedRows.length} row(s) from pending or rejected leaves`,
  );

  check(approvedLeaves.length === 80, 'approved-leave-count', `${approvedLeaves.length}`);
  check(pendingLeaves.length === 10, 'pending-leave-count', `${pendingLeaves.length}`);
  check(rejectedLeaves.length === 6, 'rejected-leave-count', `${rejectedLeaves.length}`);
  check(
    approvedLeaves.filter((leave) => leave.startDate.startsWith('2025-')).length === 40,
    '2025-approved-leave-count',
    'expected 40 approved leaves in 2025',
  );
  check(
    approvedLeaves.filter((leave) => leave.startDate.startsWith('2026-')).length === 40,
    '2026-approved-leave-count',
    'expected 40 approved leaves starting in 2026',
  );
  check(
    approvedLeaves.filter((leave) => leave.startDate > SEED_HISTORY_LAST_MARKED).length === 3,
    'future-approved-leave-count',
    'expected three approved leaves after the last marked date',
  );

  const overlappingLeaves: string[] = [];
  const leavesByEmployee = new Map<string, LeaveInfo[]>();
  for (const leave of approvedLeaves) {
    const list = leavesByEmployee.get(leave.employeeId) ?? [];
    list.push(leave);
    leavesByEmployee.set(leave.employeeId, list);
  }
  for (const [employeeId, leaves] of leavesByEmployee) {
    leaves.sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let index = 1; index < leaves.length; index += 1) {
      const previous = leaves[index - 1];
      const current = leaves[index];
      if (previous && current && current.startDate <= previous.endDate) {
        overlappingLeaves.push(`${employeeId}:${previous.key}/${current.key}`);
      }
    }
  }
  check(
    overlappingLeaves.length === 0,
    'approved-leaves-no-overlap',
    overlappingLeaves.join(', '),
  );

  const allLeaves = [...approvedLeaves, ...pendingLeaves, ...rejectedLeaves];
  const yearCrossingLeaves = allLeaves.filter(
    (leave) => leave.startDate.slice(0, 4) !== leave.endDate.slice(0, 4),
  );
  const crossYearLeave = yearCrossingLeaves[0];
  check(
    yearCrossingLeaves.length === 1 &&
      crossYearLeave?.key === 'noah-dec' &&
      crossYearLeave.startDate === '2025-12-22' &&
      crossYearLeave.endDate === '2026-01-02' &&
      crossYearLeave.days === 4,
    'one-cross-year-leave-with-actual-year-counting',
    `expected only noah-dec (22 Dec-2 Jan, 4 counted days), got ${yearCrossingLeaves
      .map((leave) => `${leave.key}:${leave.days}`)
      .join(', ')}`,
  );

  const employmentLeaveErrors = allLeaves.filter((leave) => {
    const employee = employeeById.get(leave.employeeId);
    if (!employee) return true;
    if (leave.startDate < employee.hireDate) return true;
    if (employee.leftDate && leave.endDate > employee.leftDate) return true;
    if (leave.startDate < SEED_HISTORY_START || leave.endDate > SEED_HISTORY_END) return true;
    return false;
  });
  check(
    employmentLeaveErrors.length === 0,
    'leaves-employment-bounds',
    employmentLeaveErrors.map((leave) => leave.key).join(', '),
  );

  const holidayLeaves = approvedLeaves.filter((leave) =>
    eachDate(leave.startDate, leave.endDate).some((date) => isEnglandBankHoliday(date)),
  );
  check(
    holidayLeaves.length === 4,
    'deliberate-bank-holiday-leaves',
    `${holidayLeaves.length} approved leave(s) contain an England bank holiday`,
  );
  const holidayLeave2025 = holidayLeaves.find((leave) => leave.key === 'harry-may');
  const holidayLeave2026 = holidayLeaves.find((leave) => leave.key === 'grace-2026-may');
  const easterLeave2026 = holidayLeaves.find((leave) => leave.key === 'ruby-2026-easter');
  check(
    Boolean(holidayLeave2025) &&
      holidayLeave2025?.type === 'vacation' &&
      holidayLeave2025?.days === 21 &&
      eachDate(holidayLeave2025.startDate, holidayLeave2025.endDate).includes('2025-05-05'),
    '2025-bank-holiday-leave-documented',
    'the 2025 deliberate case must be harry-may, a vacation with 21 counted days around the 5 May and 26 May bank holidays',
  );
  check(
    Boolean(holidayLeave2026) &&
      holidayLeave2026?.type === 'vacation' &&
      holidayLeave2026?.days === 2 &&
      eachDate(holidayLeave2026.startDate, holidayLeave2026.endDate).includes('2026-05-04'),
    '2026-bank-holiday-leave-documented',
    'the 2026 deliberate case must be grace-2026-may, a vacation with 2 counted days around 2026-05-04',
  );
  check(
    Boolean(easterLeave2026) &&
      easterLeave2026?.type === 'vacation' &&
      easterLeave2026?.days === 2 &&
      easterLeave2026.startDate === '2026-04-02' &&
      easterLeave2026.endDate === '2026-04-07',
    '2026-easter-bank-holiday-leave-documented',
    'ruby-2026-easter must count only 2 days across Good Friday and Easter Monday',
  );

  const futureLeaves = approvedLeaves.filter((leave) => leave.startDate > SEED_HISTORY_LAST_MARKED);
  const futureLeavesToday = futureLeaves.filter(
    (leave) => leave.startDate <= '2026-10-21' && leave.endDate >= '2026-10-21',
  );
  check(
    futureLeavesToday.length === 2 &&
      new Set(futureLeavesToday.map((leave) => leave.employeeId)).size === 2,
    'two-leaves-spanning-today',
    `${futureLeavesToday.length} future leave(s) span 2026-10-21`,
  );
  check(
    futureLeaves.some(
      (leave) => leave.startDate >= '2026-12-01' && leave.startDate <= '2026-12-31',
    ),
    'future-december-leave',
    'no approved leave was added in December 2026',
  );

  const nextDayRows = attendance.filter((row) => row.date === '2026-10-21');
  check(
    nextDayRows.length === 2 && nextDayRows.every((row) => row.source === 'leave_sync'),
    'today-only-leave-sync',
    `${nextDayRows.length} row(s), ${nextDayRows.filter((row) => row.source !== 'leave_sync').length} manual`,
  );

  const approvedByEmployee = new Map<string, LeaveInfo[]>();
  for (const leave of approvedLeaves) {
    const list = approvedByEmployee.get(leave.employeeId) ?? [];
    list.push(leave);
    approvedByEmployee.set(leave.employeeId, list);
  }
  const manualLeaveOverrides = manualRows.filter(
    (row) =>
      !holidayEventDates.has(row.date) &&
      (approvedByEmployee.get(String(row.employeeId)) ?? []).some(
        (leave) => leave.startDate <= row.date && leave.endDate >= row.date,
      ),
  );
  check(
    manualLeaveOverrides.length === 2 &&
      manualLeaveOverrides.every((row) => row.status === 'present') &&
      manualLeaveOverrides.every((row) => row.leaveId === null) &&
      manualLeaveOverrides.every(
        (row) =>
          Boolean(row.checkIn) &&
          (row.checkIn ?? '') >= '08:30' &&
          (row.checkIn ?? '') <= '09:00' &&
          Boolean(row.checkOut) &&
          (row.checkOut ?? '') >= '17:00' &&
          (row.checkOut ?? '') <= '18:15',
      ),
    'two-manual-leave-day-overrides',
    `${manualLeaveOverrides.length} manual override(s) on approved leave days`,
  );

  const approvedWorkingDays = approvedLeaves.reduce((sum, leave) => sum + leave.days, 0);
  const leaveSyncRows = attendance.filter((row) => row.source === 'leave_sync');
  check(
    approvedWorkingDays - manualLeaveOverrides.length === leaveSyncRows.length,
    'leave-sync-day-count',
    `${leaveSyncRows.length} sync row(s) for ${approvedWorkingDays} approved day(s) and ${manualLeaveOverrides.length} override(s)`,
  );

  const pendingRows = attendance.filter((row) => row.leaveId && pendingIds.has(String(row.leaveId)));
  const rejectedRows = attendance.filter((row) => row.leaveId && rejectedIds.has(String(row.leaveId)));
  check(pendingRows.length === 0, 'pending-leaves-no-attendance', `${pendingRows.length} pending rows`);
  check(rejectedRows.length === 0, 'rejected-leaves-no-attendance', `${rejectedRows.length} rejected rows`);

  let longestAbsenceRun = 0;
  for (const employee of employees) {
    let run = 0;
    for (const date of employeeExpectedDates(employee)) {
      const row = attendanceByKey.get(keyFor(employee.id, date));
      if (row?.status === 'absent') {
        run += 1;
        longestAbsenceRun = Math.max(longestAbsenceRun, run);
      } else {
        run = 0;
      }
    }
  }
  check(longestAbsenceRun <= 3, 'absence-runs-at-most-three', `${longestAbsenceRun} working days`);

  const overtimeByDay = new Map<string, number>();
  const invalidOvertime: string[] = [];
  for (const row of overtime) {
    const key = `${String(row.employeeId)}|${row.date}`;
    overtimeByDay.set(key, (overtimeByDay.get(key) ?? 0) + row.hours);
    const attendanceRow = attendanceByKey.get(key);
    if (!attendanceRow || !['present', 'late'].includes(attendanceRow.status)) {
      invalidOvertime.push(`${key} is not a worked day`);
    }
    if (row.hours < 0.5 || row.hours > 4 || Math.abs(row.hours * 4 - Math.round(row.hours * 4)) > 1e-9) {
      invalidOvertime.push(`${key} has invalid hours ${row.hours}`);
    }
  }
  const overLimit = [...overtimeByDay.entries()].filter(([, total]) => total > 24);
  check(invalidOvertime.length === 0, 'overtime-worked-days-and-hours', invalidOvertime.join(', '));
  check(overLimit.length === 0, 'overtime-daily-limit', overLimit.map(([key]) => key).join(', '));

  const overtime2025 = overtime.filter((row) => row.date.startsWith('2025-'));
  const overtime2026 = overtime.filter((row) => row.date.startsWith('2026-'));
  check(overtime.length === 260, 'overtime-count', `${overtime.length} entries`);
  check(overtime2025.length === 150, 'overtime-2025-count', `${overtime2025.length} entries`);
  check(
    overtime2026.length === 110 && overtime2026.every((row) => row.date <= SEED_HISTORY_LAST_MARKED),
    'overtime-2026-count',
    `${overtime2026.length} entries through ${SEED_HISTORY_LAST_MARKED}`,
  );
  const overtimeMonths = new Set(overtime.map((row) => row.date.slice(0, 7)));
  check(overtimeMonths.size === 22, 'overtime-all-months', `${overtimeMonths.size} month(s)`);

  const invalidEventRange = eventRows.filter((event) => event.endDate < event.startDate);
  check(invalidEventRange.length === 0, 'event-valid-range', `${invalidEventRange.length} bad range(s)`);
  const invalidEventType = eventRows.filter((event) => !EVENT_TYPES.includes(event.type as EventType));
  check(invalidEventType.length === 0, 'event-valid-type', `${invalidEventType.length} bad type(s)`);
  const leafEventTypes = eventRows.filter((event) => !EVENT_TYPES.includes(event.type as EventType));
  check(leafEventTypes.length === 0, 'no-leave-vacation-event-types', `${leafEventTypes.length} leave/vacation event(s)`);

  const duplicateTitles = new Set<string>();
  const seenTitles = new Set<string>();
  for (const event of eventRows) {
    const key = `${event.title}|${event.startDate}`;
    if (seenTitles.has(key)) duplicateTitles.add(key);
    seenTitles.add(key);
  }
  check(duplicateTitles.size === 0, 'event-unique-title-start', [...duplicateTitles].join(', '));

  const bannedWording = eventRows.filter((event) =>
    /payroll|salary|bonus/i.test(`${event.title} ${event.description ?? ''}`),
  );
  check(
    bannedWording.length === 0,
    'event-no-payroll-wording',
    bannedWording.map((event) => event.title).join(', '),
  );

  const eventCountsByYear: Record<string, Record<EventType, number>> = {};
  for (const year of [2025, 2026] as const) {
    const counts = newEventCounts();
    for (const event of eventRows) {
      if (event.startDate.startsWith(`${year}-`)) counts[event.type as EventType] += 1;
    }
    eventCountsByYear[String(year)] = counts;
  }
  const events2025 = eventRows.filter((event) => event.startDate.startsWith('2025-'));
  const events2026 = eventRows.filter((event) => event.startDate.startsWith('2026-'));
  check(events2025.length >= 65 && events2025.length <= 85, 'event-2025-count', `${events2025.length} events`);
  check(events2026.length >= 55 && events2026.length <= 85, 'event-2026-count', `${events2026.length} events`);
  check(
    eventCountsByYear['2025']?.holiday === 9 &&
      eventCountsByYear['2025']?.deadline === 21 &&
      eventCountsByYear['2025']?.meeting === 29 &&
      eventCountsByYear['2025']?.event === 16,
    'event-2025-type-counts',
    JSON.stringify(eventCountsByYear['2025']),
  );
  check(
    eventCountsByYear['2026']?.holiday === 9 &&
      eventCountsByYear['2026']?.deadline === 20 &&
      eventCountsByYear['2026']?.meeting === 29 &&
      eventCountsByYear['2026']?.event === 15,
    'event-2026-type-counts',
    JSON.stringify(eventCountsByYear['2026']),
  );

  const eventStartDates = new Set(eventRows.map((event) => event.startDate));
  for (const date of [
    ...ENGLAND_BANK_HOLIDAYS_2025,
    ...ENGLAND_BANK_HOLIDAYS_2026,
  ]) {
    check(
      eventRows.some(
        (event) => event.type === 'holiday' && event.startDate <= date && event.endDate >= date,
      ),
      `event-bank-holiday-${date}`,
      `missing holiday event covering ${date}`,
    );
  }

  for (const year of [2025, 2026] as const) {
    const yearEvents = events.filter((event) => event.startDate.startsWith(`${year}-`));
    const monthBoundaryEvents = yearEvents.filter(
      (event) => event.startDate.slice(0, 7) !== event.endDate.slice(0, 7),
    );
    const saturdayEvents = yearEvents.filter((event) => isoWeekday(event.startDate) === 6);
    const sameDayCounts = new Map<string, number>();
    for (const event of yearEvents) {
      sameDayCounts.set(event.startDate, (sameDayCounts.get(event.startDate) ?? 0) + 1);
    }
    const sameDayEvents = [...sameDayCounts.entries()].filter(([, count]) => count > 1);
    check(monthBoundaryEvents.length >= 3, `event-month-boundary-${year}`, `${monthBoundaryEvents.length}`);
    check(saturdayEvents.length >= 1, `event-saturday-${year}`, `${saturdayEvents.length}`);
    check(sameDayEvents.length >= 1, `event-two-on-one-day-${year}`, `${sameDayEvents.length}`);

    const closure = yearEvents.find((event) => event.title === 'Christmas office closure');
    check(
      Boolean(closure) && closure?.startDate === `${year}-12-29` && closure?.endDate === `${year}-12-31`,
      `event-christmas-closure-${year}`,
      'Christmas closure must be 29-31 December',
    );

    const leaveDayEvents = yearEvents.filter((event) =>
      approvedLeaves.some(
        (leave) => leave.startDate <= event.startDate && leave.endDate >= event.startDate,
      ),
    );
    check(leaveDayEvents.length >= 1, `event-on-leave-day-${year}`, `${leaveDayEvents.length}`);
  }

  for (const date of ['2025-03-30', '2025-10-26', '2026-03-29', '2026-10-25']) {
    check(eventStartDates.has(date), `event-clock-change-${date}`, `missing clock-change event on ${date}`);
  }

  const outOfRangeEvents = eventRows.filter(
    (event) => event.startDate < SEED_HISTORY_START || event.endDate > SEED_HISTORY_END,
  );
  check(outOfRangeEvents.length === 0, 'events-in-history-range', `${outOfRangeEvents.length} event(s)`);

  const manualAttendance = manualRows.length;
  const expectedSlots = employees.reduce(
    (sum, employee) => sum + employeeExpectedDates(employee).length,
    0,
  );
  const targetUnmarked = Math.max(1, Math.round(expectedSlots * 0.003));
  check(
    deliberatelyUnmarked === targetUnmarked,
    'deliberate-unmarked-count',
    `${deliberatelyUnmarked} selected, ${targetUnmarked} target`,
  );
  check(
    deliberatelyUnmarked / expectedSlots >= 0.002 && deliberatelyUnmarked / expectedSlots <= 0.004,
    'deliberate-unmarked-share',
    `${percent(deliberatelyUnmarked, expectedSlots)}% of ${expectedSlots} slots`,
  );

  const statusTotal = Object.values(leaveStatus).reduce((sum, count) => sum + count, 0);
  const countedTotal = leaveStatus.present + leaveStatus.late + leaveStatus.absent;
  const presentShare = percent(leaveStatus.present, countedTotal);
  const lateShare = percent(leaveStatus.late, countedTotal);
  const absentShare = percent(leaveStatus.absent, countedTotal);
  check(presentShare >= 85 && presentShare <= 91, 'counted-mix-present', `${presentShare}% present`);
  check(lateShare >= 5 && lateShare <= 9, 'counted-mix-late', `${lateShare}% late`);
  check(absentShare >= 1.5 && absentShare <= 4.5, 'counted-mix-absent', `${absentShare}% absent`);

  const futureLeaveRows = attendance.filter(
    (row) => row.date > SEED_HISTORY_LAST_MARKED && row.source === 'leave_sync',
  );
  const monthStats: SeedMonthStat[] = [];

  for (let year = 2025; year <= 2026; year += 1) {
    const lastMonth = year === 2026 ? 10 : 12;
    for (let month = 1; month <= lastMonth; month += 1) {
      const monthKey = `${year}-${pad(month)}`;
      const statuses = { present: 0, late: 0, absent: 0, on_leave: 0, vacation: 0 };
      let futureMonthRows = 0;
      for (const row of attendance) {
        if (row.date.slice(0, 7) !== monthKey) continue;
        if (row.status in statuses) {
          statuses[row.status as keyof typeof statuses] += 1;
        }
        if (row.date > SEED_HISTORY_LAST_MARKED) futureMonthRows += 1;
      }

      let expectedMonthSlots = 0;
      let notMarked = 0;

      for (const employee of employees) {
        for (const date of employeeExpectedDates(employee)) {
          if (date.slice(0, 7) !== monthKey) continue;
          expectedMonthSlots += 1;
          if (!attendanceByKey.has(keyFor(employee.id, date))) notMarked += 1;
        }
      }

      monthStats.push({
        month: monthKey,
        present: statuses.present,
        late: statuses.late,
        absent: statuses.absent,
        onLeave: statuses.on_leave,
        vacation: statuses.vacation,
        notMarked,
        expectedSlots: expectedMonthSlots,
        futureLeaveRows: futureMonthRows,
      });
    }
  }

  function sumTotals(rows: SeedMonthStat[]): SeedYearTotals {
    return rows.reduce(
      (totals, month) => ({
        present: totals.present + month.present,
        late: totals.late + month.late,
        absent: totals.absent + month.absent,
        onLeave: totals.onLeave + month.onLeave,
        vacation: totals.vacation + month.vacation,
        notMarked: totals.notMarked + month.notMarked,
        expectedSlots: totals.expectedSlots + month.expectedSlots,
        recorded: totals.recorded + month.present + month.late + month.absent + month.onLeave + month.vacation,
        futureLeaveRows: totals.futureLeaveRows + month.futureLeaveRows,
      }),
      {
        present: 0,
        late: 0,
        absent: 0,
        onLeave: 0,
        vacation: 0,
        notMarked: 0,
        expectedSlots: 0,
        recorded: 0,
        futureLeaveRows: 0,
      },
    );
  }

  function makeYearStat(year: number, rows: SeedMonthStat[]): SeedYearStat {
    const totals = sumTotals(rows);
    const counted = totals.present + totals.late + totals.absent;
    return {
      year,
      months: rows.length,
      totals,
      statusShares: {
        present: percent(totals.present, totals.recorded),
        late: percent(totals.late, totals.recorded),
        absent: percent(totals.absent, totals.recorded),
        onLeave: percent(totals.onLeave, totals.recorded),
        vacation: percent(totals.vacation, totals.recorded),
      },
      countedMix: {
        present: percent(totals.present, counted),
        late: percent(totals.late, counted),
        absent: percent(totals.absent, counted),
      },
      notMarkedShare: percent(totals.notMarked, totals.expectedSlots),
    };
  }

  const yearStats = [2025, 2026].map((year) =>
    makeYearStat(
      year,
      monthStats.filter((month) => month.month.startsWith(`${year}-`)),
    ),
  );
  const overallTotals = sumTotals(monthStats);

  // The 22-month table ends with October 2026, but the three future December
  // leave rows are part of the dataset. Include them in the year/overall totals
  // (the dashboard year series also sees them) while keeping the table at the
  // requested 22 months.
  const hiddenFutureRows = futureLeaveRows.filter((row) => row.date > '2026-10-31');
  const futureByYear = new Map<number, number>();
  for (const row of futureLeaveRows) {
    const year = Number(row.date.slice(0, 4));
    futureByYear.set(year, (futureByYear.get(year) ?? 0) + 1);
  }

  function addAttendanceToTotals(totals: SeedYearTotals, rows: typeof hiddenFutureRows): void {
    for (const row of rows) {
      if (row.status === 'present') totals.present += 1;
      else if (row.status === 'late') totals.late += 1;
      else if (row.status === 'absent') totals.absent += 1;
      else if (row.status === 'on_leave') totals.onLeave += 1;
      else if (row.status === 'vacation') totals.vacation += 1;
      totals.recorded += 1;
    }
  }

  for (const stat of yearStats) {
    if (stat.year === 2026) {
      addAttendanceToTotals(stat.totals, hiddenFutureRows);
      stat.statusShares = {
        present: percent(stat.totals.present, stat.totals.recorded),
        late: percent(stat.totals.late, stat.totals.recorded),
        absent: percent(stat.totals.absent, stat.totals.recorded),
        onLeave: percent(stat.totals.onLeave, stat.totals.recorded),
        vacation: percent(stat.totals.vacation, stat.totals.recorded),
      };
    }
    stat.totals.futureLeaveRows = futureByYear.get(stat.year) ?? 0;
  }
  addAttendanceToTotals(overallTotals, hiddenFutureRows);
  overallTotals.futureLeaveRows = futureLeaveRows.length;

  const eventCounts = newEventCounts();
  const eventsByMonth: Array<Record<EventType, number> & { month: string; total: number }> = [];
  for (let year = 2025; year <= 2026; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const monthKey = `${year}-${pad(month)}`;
      const counts = newEventCounts();
      for (const event of eventRows) {
        if (event.startDate.slice(0, 7) !== monthKey) continue;
        counts[event.type as EventType] += 1;
      }
      for (const type of EVENT_TYPES) eventCounts[type] += counts[type];
      eventsByMonth.push({
        month: monthKey,
        ...counts,
        total: EVENT_TYPES.reduce((sum, type) => sum + counts[type], 0),
      });
    }
  }

  const topChecks: SeedTopCheck[] = [];
  for (const month of ['2025-03', '2026-09']) {
    const expected = await rawTopEmployees(month, employees);
    const actual = (await dashboardMonth(month)).topEmployees;
    const matches = sameTopEmployees(expected, actual);
    topChecks.push({ month, expected, actual, matches });
    check(matches, `top-employees-${month}`, 'hand calculation differs from dashboard service');
  }

  const dashboardYears: SeedDashboardYearCheck[] = [];
  for (const year of [2025, 2026] as const) {
    const serviceYear = await dashboardYear(year);
    const rawYear = new Map<string, { attendance: number; absence: number; leave: number }>();
    for (let month = 1; month <= 12; month += 1) {
      rawYear.set(`${year}-${pad(month)}`, { attendance: 0, absence: 0, leave: 0 });
    }
    for (const row of attendance) {
      const point = rawYear.get(row.date.slice(0, 7));
      if (!point) continue;
      if (row.status === 'present' || row.status === 'late') point.attendance += 1;
      else if (row.status === 'absent') point.absence += 1;
      else if (row.status === 'on_leave' || row.status === 'vacation') point.leave += 1;
    }
    const yearMatches =
      serviceYear.months.length === 12 &&
      serviceYear.months.every((point) => {
        const raw = rawYear.get(point.month);
        return (
          Boolean(raw) &&
          point.attendance === raw?.attendance &&
          point.absence === raw?.absence &&
          point.leave === raw?.leave
        );
      });
    check(yearMatches, `dashboard-year-${year}`, 'dashboard year series differs from raw attendance');
    const totals = serviceYear.months.reduce(
      (accumulator, point) => ({
        attendance: accumulator.attendance + point.attendance,
        absence: accumulator.absence + point.absence,
        leave: accumulator.leave + point.leave,
      }),
      { attendance: 0, absence: 0, leave: 0 },
    );
    if (year === 2026) {
      check(
        serviceYear.months.slice(10).every((point) => point.attendance === 0 && point.absence === 0),
        'dashboard-2026-no-manual-after-october',
        'a later 2026 month has marked attendance or absence',
      );
    }
    dashboardYears.push({ year, matches: yearMatches, months: serviceYear.months.length, ...totals });
  }

  const todaySummary = await dashboardSummary('2026-10-21');
  const expectedNotMarked = activeEmployees.length - todaySummary.onLeave;
  const todayMatches =
    todaySummary.date === '2026-10-21' &&
    todaySummary.totalEmployees === activeEmployees.length &&
    todaySummary.present === 0 &&
    todaySummary.late === 0 &&
    todaySummary.absent === 0 &&
    todaySummary.onLeave === 2 &&
    todaySummary.notMarked === expectedNotMarked;
  check(
    todayMatches,
    'dashboard-today-2026-10-21',
    `onLeave=${todaySummary.onLeave}, notMarked=${todaySummary.notMarked}, expectedNotMarked=${expectedNotMarked}`,
  );

  const lastMarkedDate = '2026-10-20';
  const lastMarkedRows = attendance.filter((row) => row.date === lastMarkedDate);
  const lastMarkedManualRows = lastMarkedRows.filter((row) => row.source === 'manual');
  check(
    lastMarkedRows.length > 0 && lastMarkedManualRows.length > 0,
    'dashboard-attendance-sheet-last-marked',
    `${lastMarkedRows.length} row(s) on ${lastMarkedDate}`,
  );
  check(
    nextDayRows.length === 2 && nextDayRows.every((row) => row.source === 'leave_sync'),
    'dashboard-attendance-sheet-today',
    `${nextDayRows.length} row(s) on 2026-10-21`,
  );
  check(
    futureLeaveRows.length === 8,
    'future-leave-sync-row-count',
    `${futureLeaveRows.length} leave_sync row(s) after ${SEED_HISTORY_LAST_MARKED}`,
  );

  const octoberMarkedWorkingDays = workingDaysBetween('2026-10-01', '2026-10-20').length;
  const octoberFullWorkingDays = workingDaysBetween('2026-10-01', '2026-10-31').length;

  const createdByNullCounts = await Promise.all([
    AttendanceModel.countDocuments({ createdBy: null }),
    OvertimeModel.countDocuments({ createdBy: null }),
    EventModel.countDocuments({ createdBy: null }),
    LeaveModel.countDocuments({ createdBy: null }),
    LeaveAllowanceModel.countDocuments({ createdBy: null }),
  ]);
  check(
    createdByNullCounts.every((count) => count === 0),
    'records-created-by-admin',
    `null createdBy counts: ${createdByNullCounts.join(', ')}`,
  );

  return {
    assertions,
    allowanceChecks,
    months: monthStats,
    years: yearStats,
    overallTotals,
    notMarkedShare: percent(deliberatelyUnmarked, expectedSlots),
    eventCounts,
    eventCountsByYear,
    eventsByMonth,
    multiDayEvents: events.filter((event) => event.endDate > event.startDate),
    edgeCaseEvents: events.filter((event) => event.edgeCases.length > 0),
    topChecks,
    dashboardYears,
    dashboardToday: {
      date: todaySummary.date,
      matches: todayMatches,
      totalEmployees: todaySummary.totalEmployees,
      notMarked: todaySummary.notMarked ?? 0,
      expectedNotMarked,
      onLeave: todaySummary.onLeave,
    },
    attendanceSheet: {
      lastMarkedDate,
      lastMarkedRows: lastMarkedRows.length,
      lastMarkedManualRows: lastMarkedManualRows.length,
      nextDayDate: '2026-10-21',
      nextDayRows: nextDayRows.length,
      nextDayLeaveSyncRows: nextDayRows.filter((row) => row.source === 'leave_sync').length,
      nextDayManualRows: nextDayRows.filter((row) => row.source === 'manual').length,
    },
    futureLeaveRows: futureLeaveRows.length,
    october2026: {
      lastMarked: SEED_HISTORY_LAST_MARKED,
      markedWorkingDays: octoberMarkedWorkingDays,
      fullWorkingDays: octoberFullWorkingDays,
    },
    holidayLeaves,
  };
}

/** Canonical business-data checksum. ObjectIds and timestamps are excluded. */
export async function computeSeedChecksum(): Promise<string> {
  const [departments, employees, attendance, leaves, overtime, events, allowances] = await Promise.all([
    DepartmentModel.find().lean(),
    EmployeeModel.find().select('name email phone departmentId position hireDate status').lean(),
    AttendanceModel.find().lean(),
    LeaveModel.find().lean(),
    OvertimeModel.find().lean(),
    EventModel.find().lean(),
    LeaveAllowanceModel.find().lean(),
  ]);

  const departmentById = new Map(departments.map((row) => [String(row._id), row.name]));
  const employeeById = new Map(employees.map((row) => [String(row._id), row]));
  const leaveSignatureById = new Map(
    leaves.map((row) => {
      const employee = employeeById.get(String(row.employeeId));
      return [
        String(row._id),
        [
          employee?.name ?? 'missing',
          row.type,
          row.category ?? '',
          row.startDate,
          row.endDate,
          row.days,
          row.status,
          row.reason ?? '',
        ].join('|'),
      ];
    }),
  );

  const rows: string[] = [];

  for (const row of departments) {
    rows.push(['department', row.name, row.location ?? '', row.description ?? ''].join('|'));
  }

  for (const row of employees) {
    rows.push(
      [
        'employee',
        row.name,
        row.email ?? '',
        row.phone ?? '',
        departmentById.get(String(row.departmentId)) ?? 'missing',
        row.position ?? '',
        row.hireDate ?? '',
        row.status,
      ].join('|'),
    );
  }

  for (const row of attendance) {
    const employee = employeeById.get(String(row.employeeId));
    const leaveSignature =
      row.source === 'leave_sync' && row.leaveId
        ? leaveSignatureById.get(String(row.leaveId)) ?? 'orphan-leave'
        : '';
    rows.push(
      [
        'attendance',
        employee?.name ?? 'missing',
        row.date,
        row.status,
        row.checkIn ?? '',
        row.checkOut ?? '',
        row.note ?? '',
        row.source,
        leaveSignature,
      ].join('|'),
    );
  }

  for (const row of leaves) {
    rows.push(['leave', leaveSignatureById.get(String(row._id)) ?? 'missing'].join('|'));
  }

  for (const row of overtime) {
    const employee = employeeById.get(String(row.employeeId));
    rows.push(
      ['overtime', employee?.name ?? 'missing', row.date, String(row.hours), row.note ?? ''].join('|'),
    );
  }

  for (const row of events) {
    rows.push(
      [
        'event',
        row.title,
        row.description ?? '',
        row.type,
        row.startDate,
        row.endDate,
      ].join('|'),
    );
  }

  for (const row of allowances) {
    const employee = employeeById.get(String(row.employeeId));
    rows.push(
      [
        'allowance',
        employee?.name ?? 'missing',
        row.year,
        row.allowance,
        row.note ?? '',
      ].join('|'),
    );
  }

  rows.sort();
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

export interface SeedHistoryOptions {
  adminId: string;
  reset?: boolean;
}

/**
 * Generate the 2025-2026 HR history. The caller must connect to a safe
 * test/demo database first; `seed/seed-history.ts` owns the production and
 * database-name guards.
 */
export async function seedHistoryData(options: SeedHistoryOptions): Promise<SeedHistoryResult> {
  const admin = await AdminModel.findOne({ _id: options.adminId, isActive: true }).select('_id').lean();
  if (!admin) {
    throw new Error('An active administrator is required before generating the history data.');
  }

  const existingEmployees = await EmployeeModel.countDocuments();
  const otherCounts = await Promise.all([
    DepartmentModel.countDocuments(),
    AttendanceModel.countDocuments(),
    OvertimeModel.countDocuments(),
    LeaveModel.countDocuments(),
    LeaveAllowanceModel.countDocuments(),
    EventModel.countDocuments(),
  ]);
  const hasOtherData = otherCounts.some((count) => count > 0);

  if (existingEmployees > 0 && !options.reset) {
    throw new Error(
      `The database already contains ${existingEmployees} employee(s). Re-run with -- --reset to replace only the seed data collections.`,
    );
  }

  if (existingEmployees === 0 && hasOtherData && !options.reset) {
    throw new Error(
      'The database contains orphaned seed collections. Re-run with -- --reset to clear only attendance, overtime, leaves, events, employees and departments.',
    );
  }

  const resetDeleted = options.reset
    ? await resetSeedCollections()
    : { attendance: 0, overtime: 0, leaves: 0, leaveallowances: 0, events: 0, employees: 0, departments: 0 };

  const adminObjectId = new Types.ObjectId(options.adminId);
  const random = makeSeededRandom(SEED_HISTORY_RANDOM_SEED);

  // ---- departments ------------------------------------------------------
  const departmentDocs = await DepartmentModel.insertMany(
    SEED_HISTORY_DEPARTMENTS.map((department) => ({
      name: department.name,
      location: department.location,
      description: department.description,
    })),
  );
  const departmentByName = new Map(
    departmentDocs.map((department) => [department.name, String(department._id)]),
  );

  // ---- employees --------------------------------------------------------
  const employeeRows = SEED_HISTORY_EMPLOYEES.map((employee) => ({
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    departmentId: departmentByName.get(employee.department),
    position: employee.position,
    hireDate: employee.hireDate,
    status: employee.status,
  }));
  const employeeDocs = await EmployeeModel.insertMany(employeeRows);
  const employeeByName = new Map(employeeDocs.map((employee) => [employee.name, employee]));

  const employees: SeedEmployeeRecord[] = SEED_HISTORY_EMPLOYEES.map((employee) => {
    const doc = employeeByName.get(employee.name);
    if (!doc) throw new Error(`Could not create employee ${employee.key}.`);

    return {
      id: String(doc._id),
      key: employee.key,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      departmentId: String(doc.departmentId),
      departmentName: employee.department,
      position: employee.position,
      hireDate: employee.hireDate,
      status: employee.status,
      profile: employee.profile,
      leftDate: employee.leftDate ?? null,
    };
  });
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const employeeByKey = new Map(employees.map((employee) => [employee.key, employee]));

  // ---- events -----------------------------------------------------------
  // The holiday events are inserted **before** the leaves: the leave service
  // counts working days from the holiday calendar, so a bank holiday must
  // already exist when each leave is created.
  const eventSeeds = makeEventSeeds();
  const eventDocs = await EventModel.insertMany(
    eventSeeds.map((event) => ({
      ...event,
      createdBy: adminObjectId,
      updatedBy: adminObjectId,
    })),
  );

  // ---- holiday allowances ----------------------------------------------
  // Inserted before the leaves too: the leave service checks the over-allowance
  // guard when it creates an approved vacation.
  const allowanceRows = SEED_HISTORY_ALLOWANCES.map((plan) => {
    const employee = employeeByKey.get(plan.employeeKey);
    if (!employee) {
      throw new Error(`Could not resolve employee for allowance ${plan.employeeKey}/${plan.year}.`);
    }

    return {
      employeeId: new Types.ObjectId(employee.id),
      year: plan.year,
      allowance: plan.allowance,
      note: plan.note,
      createdBy: adminObjectId,
      updatedBy: adminObjectId,
    };
  });

  await LeaveAllowanceModel.insertMany(allowanceRows);

  // ---- leaves through the real leave service ---------------------------
  const approvedIdsByKey = new Map<string, string>();
  const pendingIdsByKey = new Map<string, string>();
  const rejectedIdsByKey = new Map<string, string>();

  const allPlans: Array<{ plan: LeavePlan; status: LeaveStatus; target: Map<string, string> }> = [
    ...SEED_HISTORY_APPROVED_LEAVES.map((plan) => ({
      plan,
      status: 'approved' as const,
      target: approvedIdsByKey,
    })),
    ...SEED_HISTORY_PENDING_LEAVES.map((plan) => ({
      plan,
      status: 'pending' as const,
      target: pendingIdsByKey,
    })),
    ...SEED_HISTORY_REJECTED_LEAVES.map((plan) => ({
      plan,
      status: 'rejected' as const,
      target: rejectedIdsByKey,
    })),
  ];

  for (const entry of allPlans) {
    const leaveEmployee = entry.plan.employeeKey
      ? employeeByKey.get(entry.plan.employeeKey)
      : employees.find(
          (candidate) =>
            candidate.name.split(' ')[0]?.toLowerCase() ===
            entry.plan.key.split('-')[0]?.toLowerCase(),
        );

    if (!leaveEmployee) {
      throw new Error(`Could not resolve employee for leave ${entry.plan.key}.`);
    }

    const leave = (await createLeave(
      {
        employeeId: leaveEmployee.id,
        type: entry.plan.type,
        category: entry.plan.category,
        startDate: entry.plan.startDate,
        endDate: entry.plan.endDate,
        reason: entry.plan.reason,
        status: entry.status,
        confirmOverAllowance: entry.plan.confirmOverAllowance === true,
      },
      options.adminId,
    )) as { _id: unknown };

    entry.target.set(entry.plan.key, String(leave._id));
  }

  const approvedLeaves = await loadLeaveInfo(
    SEED_HISTORY_APPROVED_LEAVES,
    approvedIdsByKey,
    employeeById,
  );
  const pendingLeaves = await loadLeaveInfo(
    SEED_HISTORY_PENDING_LEAVES,
    pendingIdsByKey,
    employeeById,
  );
  const rejectedLeaves = await loadLeaveInfo(
    SEED_HISTORY_REJECTED_LEAVES,
    rejectedIdsByKey,
    employeeById,
  );

  // The sync rows are created by the real reconcile function. The seed actor
  // then owns them, because this script is the administrator action behind the
  // dataset. No other fields of those rows are touched.
  await AttendanceModel.updateMany(
    { source: 'leave_sync' },
    { $set: { createdBy: adminObjectId, updatedBy: adminObjectId } },
  );

  // ---- attendance -------------------------------------------------------
  const leaveSyncRows = await AttendanceModel.find({ source: 'leave_sync' })
    .select('employeeId date')
    .lean();
  const leaveKeys = new Set(leaveSyncRows.map((row) => keyFor(String(row.employeeId), row.date)));

  const expectedDatesByEmployee = new Map(
    employees.map((employee) => [employee.id, employeeExpectedDates(employee)]),
  );
  const expectedSlots = [...expectedDatesByEmployee.values()].reduce(
    (sum, dates) => sum + dates.length,
    0,
  );

  const absenceKeys = new Set<string>();
  const lateKeys = new Set<string>();

  for (const employee of employees) {
    const expectedDates = expectedDatesByEmployee.get(employee.id) ?? [];
    if (expectedDates.length === 0) continue;

    const config = PROFILE_CONFIG[employee.profile];
    const runCount = random.int(config.absenceRuns[0], config.absenceRuns[1]);
    const employmentEnd = employee.leftDate ?? SEED_HISTORY_LAST_MARKED;

    for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const start = weightedPick(random, expectedDates, monthWeight);
        const length = random.next() < 0.5 ? 1 : random.next() < 0.66 ? 2 : 3;
        const run: string[] = [];
        let cursor = start;
        let blocked = false;

        while (run.length < length && cursor <= employmentEnd) {
          if (isWorkingDay(cursor) && !isEnglandBankHoliday(cursor)) {
            const key = keyFor(employee.id, cursor);
            if (leaveKeys.has(key) || absenceKeys.has(key)) {
              blocked = true;
              break;
            }
            run.push(key);
          }
          cursor = addDays(cursor, 1);
        }

        if (!blocked && run.length > 0) {
          const startIndex = expectedDates.indexOf(start);
          const before = startIndex > 0 ? expectedDates[startIndex - 1] : null;
          const after = expectedDates[startIndex + run.length] ?? null;
          if (
            (before && absenceKeys.has(keyFor(employee.id, before))) ||
            (after && absenceKeys.has(keyFor(employee.id, after)))
          ) {
            blocked = true;
          }
        }

        if (!blocked && run.length > 0) {
          for (const key of run) absenceKeys.add(key);
          break;
        }
      }
    }

    for (const date of expectedDates) {
      const key = keyFor(employee.id, date);
      if (leaveKeys.has(key) || absenceKeys.has(key)) continue;
      if (random.next() < config.lateChance) lateKeys.add(key);
    }
  }

  const presentOrLatePool = employees.flatMap((employee) =>
    (expectedDatesByEmployee.get(employee.id) ?? [])
      .filter((date) => {
        const key = keyFor(employee.id, date);
        return !leaveKeys.has(key) && !absenceKeys.has(key);
      })
      .map((date) => keyFor(employee.id, date)),
  );
  const deliberatelyUnmarked = Math.min(
    presentOrLatePool.length,
    Math.max(1, Math.round(expectedSlots * 0.003)),
  );
  const unmarkedKeys = new Set<string>();
  while (unmarkedKeys.size < deliberatelyUnmarked && presentOrLatePool.length > 0) {
    const key = presentOrLatePool[random.int(0, presentOrLatePool.length - 1)];
    if (key) unmarkedKeys.add(key);
  }

  const attendanceRows: Array<Record<string, unknown>> = [];

  for (const employee of employees) {
    for (const date of expectedDatesByEmployee.get(employee.id) ?? []) {
      const key = keyFor(employee.id, date);
      if (leaveKeys.has(key) || unmarkedKeys.has(key)) continue;

      const isAbsent = absenceKeys.has(key);
      const isLate = !isAbsent && lateKeys.has(key);
      const status = isAbsent ? 'absent' : isLate ? 'late' : 'present';
      const startMinutes = isLate ? random.int(550, 630) : random.int(510, 540);
      const endMinutes = random.int(1020, 1095);

      let note = '';
      if (isAbsent && random.next() < 0.6) note = random.pick(ABSENCE_NOTES);
      if (isLate && random.next() < 0.6) note = random.pick(LATE_NOTES);

      attendanceRows.push({
        employeeId: new Types.ObjectId(employee.id),
        date,
        status,
        checkIn: isAbsent ? null : timeString(startMinutes),
        checkOut: isAbsent ? null : timeString(endMinutes),
        note,
        source: 'manual',
        leaveId: null,
        createdBy: adminObjectId,
        updatedBy: adminObjectId,
      });
    }
  }

  // Two approved leave days are deliberately overridden by a manual present
  // record. This is the case an administrator creates by editing the sheet:
  // the leave still exists, but the day is no longer owned by its sync row.
  const overrideDefinitions = [
    { leaveKey: 'mason-2026-mar', date: '2026-03-09' },
    { leaveKey: 'chloe-2026-jul', date: '2026-07-27' },
  ] as const;

  for (const override of overrideDefinitions) {
    const leave = approvedLeaves.find((candidate) => candidate.key === override.leaveKey);
    if (!leave) throw new Error(`Could not find leave ${override.leaveKey} for the manual override.`);
    if (override.date < leave.startDate || override.date > leave.endDate) {
      throw new Error(`Manual override ${override.date} is outside leave ${override.leaveKey}.`);
    }
    if (!isWorkingDay(override.date) || isEnglandBankHoliday(override.date)) {
      throw new Error(`Manual override ${override.date} is not a working day.`);
    }

    await AttendanceModel.deleteOne({
      employeeId: new Types.ObjectId(leave.employeeId),
      date: override.date,
      source: 'leave_sync',
      leaveId: new Types.ObjectId(leave.id),
    });

    attendanceRows.push({
      employeeId: new Types.ObjectId(leave.employeeId),
      date: override.date,
      status: 'present',
      checkIn: '08:45',
      checkOut: '17:30',
      note: 'Manual attendance override during approved leave',
      source: 'manual',
      leaveId: null,
      createdBy: adminObjectId,
      updatedBy: adminObjectId,
    });
  }

  for (let offset = 0; offset < attendanceRows.length; offset += 750) {
    await AttendanceModel.insertMany(attendanceRows.slice(offset, offset + 750));
  }

  // ---- overtime ---------------------------------------------------------
  const workedByMonth = new Map<string, string[]>();
  for (const row of attendanceRows) {
    if (row.source !== 'manual' || !['present', 'late'].includes(String(row.status))) continue;
    const date = String(row.date);
    const month = date.slice(0, 7);
    const list = workedByMonth.get(month) ?? [];
    list.push(keyFor(String(row.employeeId), date));
    workedByMonth.set(month, list);
  }

  const overtimeTargets2025 = [13, 13, 12, 13, 12, 13, 12, 13, 12, 13, 12, 12];
  const overtimeTargets2026 = [11, 11, 11, 11, 11, 11, 11, 11, 11, 11];
  const overtimeRows: Array<Record<string, unknown>> = [];

  for (const [year, targets] of [
    [2025, overtimeTargets2025],
    [2026, overtimeTargets2026],
  ] as const) {
    const lastMonth = year === 2026 ? 10 : 12;
    for (let month = 1; month <= lastMonth; month += 1) {
      const monthKey = `${year}-${pad(month)}`;
      const candidates = [...(workedByMonth.get(monthKey) ?? [])];
      const target = targets[month - 1] ?? 11;

      for (let index = candidates.length - 1; index > 0; index -= 1) {
        const swap = random.int(0, index);
        [candidates[index], candidates[swap]] = [candidates[swap] as string, candidates[index] as string];
      }

      for (const key of candidates.slice(0, target)) {
        const [employeeId, date] = key.split('|');
        if (!employeeId || !date) continue;
        overtimeRows.push({
          employeeId: new Types.ObjectId(employeeId),
          date,
          hours: random.pick([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4] as const),
          note: random.pick(OVERTIME_NOTES),
          createdBy: adminObjectId,
          updatedBy: adminObjectId,
        });
      }
    }
  }

  await OvertimeModel.insertMany(overtimeRows);

  // ---- events -----------------------------------------------------------
  const events: SeedEventRecord[] = eventDocs.map((event) => ({
    id: String(event._id),
    title: event.title,
    description: event.description,
    type: event.type as EventType,
    startDate: event.startDate,
    endDate: event.endDate,
    edgeCases: [],
  }));

  const eventsWithEdges = eventEdgeCases(events, approvedLeaves);

  const verification = await verifySeedData(
    employees,
    approvedLeaves,
    pendingLeaves,
    rejectedLeaves,
    eventsWithEdges,
    deliberatelyUnmarked,
  );
  const checksum = await computeSeedChecksum();

  const approvedLeaves2025 = approvedLeaves.filter((leave) => leave.startDate.startsWith('2025-'));
  const approvedLeaves2026 = approvedLeaves.filter((leave) => leave.startDate.startsWith('2026-'));
  const approvedLeavesAfterCutoff = approvedLeaves.filter(
    (leave) => leave.startDate > SEED_HISTORY_LAST_MARKED,
  );
  const overtime2025 = overtimeRows.filter((row) => String(row.date).startsWith('2025-'));
  const overtime2026 = overtimeRows.filter((row) => String(row.date).startsWith('2026-'));
  const events2025 = eventsWithEdges.filter((event) => event.startDate.startsWith('2025-'));
  const events2026 = eventsWithEdges.filter((event) => event.startDate.startsWith('2026-'));
  const futureLeaveRows = await AttendanceModel.countDocuments({
    date: { $gt: SEED_HISTORY_LAST_MARKED },
    source: 'leave_sync',
  });

  return {
    checksum,
    adminId: options.adminId,
    resetDeleted,
    counts: {
      departments: departmentDocs.length,
      employees: employees.length,
      activeEmployees: employees.filter((employee) => employee.status === 'active').length,
      inactiveEmployees: employees.filter((employee) => employee.status === 'inactive').length,
      terminatedEmployees: employees.filter((employee) => employee.status === 'terminated').length,
      newHires: employees.filter(
        (employee) => employee.hireDate.startsWith('2025-') || employee.hireDate.startsWith('2026-'),
      ).length,
      newHires2025: employees.filter((employee) => employee.hireDate.startsWith('2025-')).length,
      newHires2026: employees.filter((employee) => employee.hireDate.startsWith('2026-')).length,
      attendance: await AttendanceModel.countDocuments(),
      manualAttendance: await AttendanceModel.countDocuments({ source: 'manual' }),
      leaveAttendance: await AttendanceModel.countDocuments({ source: 'leave_sync' }),
      futureLeaveRows,
      expectedSlots,
      deliberatelyUnmarked,
      approvedLeaves: approvedLeaves.length,
      approvedLeaves2025: approvedLeaves2025.length,
      approvedLeaves2026: approvedLeaves2026.length,
      approvedLeavesAfterCutoff: approvedLeavesAfterCutoff.length,
      pendingLeaves: pendingLeaves.length,
      rejectedLeaves: rejectedLeaves.length,
      overtime: overtimeRows.length,
      overtime2025: overtime2025.length,
      overtime2026: overtime2026.length,
      events: eventsWithEdges.length,
      events2025: events2025.length,
      events2026: events2026.length,
      leaveAllowances: await LeaveAllowanceModel.countDocuments(),
    },
    employees,
    approvedLeaves,
    pendingLeaves,
    rejectedLeaves,
    events: eventsWithEdges,
    verification,
  };
}
