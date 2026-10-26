import { AttendanceModel, type AttendanceStatus } from '../models/Attendance.ts';
import { DepartmentModel } from '../models/Department.ts';
import { StudentModel } from '../models/Student.ts';
import { EventModel } from '../models/Event.ts';
import { eachDate, isWorkingDay, resolveMonth, today } from '../utils/dates.ts';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const COUNTED_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent'];

export interface DashboardDepartment {
  id: string;
  name: string;
  activeStudents: number;
}

export interface DashboardSummary {
  date: string;
  isWorkingDay: boolean;
  /** True when an HR `holiday` event covers this date. */
  isHoliday: boolean;
  /** Title of the holiday covering this date, or `null`. */
  holidayTitle: string | null;
  totalStudents: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  /** `null` on a non-working day or a holiday — the card is hidden there. */
  notMarked: number | null;
  departments: DashboardDepartment[];
}

interface StatusCount {
  _id: AttendanceStatus;
  count: number;
}

/** Active students per department — one aggregation, no per-department query. */
async function departmentSummary(): Promise<DashboardDepartment[]> {
  const rows = await DepartmentModel.aggregate<DashboardDepartment>([
    {
      $lookup: {
        from: 'students',
        let: { departmentId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$departmentId', '$$departmentId'] },
                  { $eq: ['$status', 'active'] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: 'activeStudents',
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        name: 1,
        activeStudents: { $size: '$activeStudents' },
      },
    },
    { $sort: { name: 1 } },
  ]);

  return rows;
}

/**
 * The cards of the dashboard for one day (today in `APP_TIMEZONE` by default).
 *
 * Only active students are counted. "Not marked yet" is the number of active
 * students without a record; it is meaningless on a non-working day or a
 * holiday, so it is `null` there and the page hides the card.
 */
export async function dashboardSummary(date: string = today()): Promise<DashboardSummary> {
  const studentIds = await StudentModel.find({ status: 'active' }).distinct('_id');

  const [grouped, departments, holiday] = await Promise.all([
    studentIds.length === 0
      ? Promise.resolve([] as StatusCount[])
      : AttendanceModel.aggregate<StatusCount>([
          { $match: { date, studentId: { $in: studentIds } } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
    departmentSummary(),
    EventModel.findOne({
      type: 'holiday',
      startDate: { $lte: date },
      endDate: { $gte: date },
    })
      .sort({ startDate: 1, createdAt: 1 })
      .select('title')
      .lean<{ title: string } | null>(),
  ]);

  const counts: Record<string, number> = {
    present: 0,
    late: 0,
    absent: 0,
    on_leave: 0,
    vacation: 0,
  };

  let marked = 0;
  for (const row of grouped) {
    if (row._id in counts) {
      counts[row._id] = row.count;
      marked += row.count;
    }
  }

  const workingDay = isWorkingDay(date);
  const around = counts.on_leave + counts.vacation;

  return {
    date,
    isWorkingDay: workingDay,
    isHoliday: Boolean(holiday),
    holidayTitle: holiday?.title ?? null,
    totalStudents: studentIds.length,
    present: counts.present,
    late: counts.late,
    absent: counts.absent,
    onLeave: around,
    notMarked: workingDay && !holiday ? Math.max(0, studentIds.length - marked) : null,
    departments,
  };
}

export interface DashboardMonthPoint {
  month: string;
  label: string;
  attendance: number;
  absence: number;
  leave: number;
}

function emptyPoint(month: string, label: string): DashboardMonthPoint {
  return { month, label, attendance: 0, absence: 0, leave: 0 };
}

function addStatus(
  point: { attendance: number; absence: number; leave: number },
  status: string,
  count: number,
): void {
  if (status === 'present' || status === 'late') {
    point.attendance += count;
  } else if (status === 'absent') {
    point.absence += count;
  } else if (status === 'on_leave' || status === 'vacation') {
    point.leave += count;
  }
}

/** Twelve zero-filled month buckets with attendance, absence and leave counts. */
export async function dashboardYear(year: number): Promise<{
  year: number;
  start: string;
  end: string;
  months: DashboardMonthPoint[];
}> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const grouped = await AttendanceModel.aggregate<{
    _id: { month: string; status: string };
    count: number;
  }>([
    { $match: { date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { month: { $substrBytes: ['$date', 0, 7] }, status: '$status' },
        count: { $sum: 1 },
      },
    },
  ]);

  const months = MONTH_LABELS.map((label, index) =>
    emptyPoint(`${year}-${String(index + 1).padStart(2, '0')}`, label),
  );
  const byMonth = new Map(months.map((point) => [point.month, point]));

  for (const row of grouped) {
    const point = byMonth.get(row._id.month);
    if (point) addStatus(point, row._id.status, row.count);
  }

  return { year, start, end, months };
}

export interface TopStudent {
  studentId: string;
  name: string;
  position: string | null;
  department: string | null;
  score: number;
  present: number;
  late: number;
  absent: number;
}

/**
 * Top five students of a month.
 *
 * score = present × 3 − late × 1 − absent × 2. On-leave and vacation days are
 * not counted at all. Ties: fewer absences, then more present days, then name.
 * The aggregation projects name/position/department and never the photo.
 */
async function topStudents(start: string, end: string): Promise<TopStudent[]> {
  return AttendanceModel.aggregate<TopStudent>([
    {
      $match: {
        date: { $gte: start, $lte: end },
        status: { $in: COUNTED_STATUSES },
      },
    },
    {
      $group: {
        _id: '$studentId',
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'students',
        localField: '_id',
        foreignField: '_id',
        as: 'student',
        pipeline: [
          { $match: { $expr: { $eq: ['$status', 'active'] } } },
          { $project: { name: 1, position: 1, departmentId: 1 } },
        ],
      },
    },
    { $unwind: '$student' },
    {
      $lookup: {
        from: 'departments',
        localField: 'student.departmentId',
        foreignField: '_id',
        as: 'department',
      },
    },
    {
      $project: {
        _id: 0,
        studentId: { $toString: '$_id' },
        name: '$student.name',
        position: { $ifNull: ['$student.position', null] },
        department: { $ifNull: [{ $arrayElemAt: ['$department.name', 0] }, null] },
        present: 1,
        late: 1,
        absent: 1,
        score: {
          $subtract: [
            { $multiply: ['$present', 3] },
            { $add: ['$late', { $multiply: ['$absent', 2] }] },
          ],
        },
      },
    },
    { $sort: { score: -1, absent: 1, present: -1, name: 1 } },
    { $limit: 5 },
  ]);
}

export interface DashboardDayPoint {
  date: string;
  label: string;
  attendance: number;
  absence: number;
  leave: number;
}

/** Daily series and the top students of one month. */
export async function dashboardMonth(month: string): Promise<{
  month: string;
  start: string;
  end: string;
  days: DashboardDayPoint[];
  topStudents: TopStudent[];
}> {
  const bounds = resolveMonth(month);
  const monthKey = `${bounds.year}-${String(bounds.month).padStart(2, '0')}`;

  const [grouped, top] = await Promise.all([
    AttendanceModel.aggregate<{
      _id: { date: string; status: string };
      count: number;
    }>([
      { $match: { date: { $gte: bounds.start, $lte: bounds.end } } },
      {
        $group: {
          _id: { date: '$date', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    topStudents(bounds.start, bounds.end),
  ]);

  const days = eachDate(bounds.start, bounds.end).map((date) => ({
    date,
    label: String(Number(date.slice(8, 10))),
    attendance: 0,
    absence: 0,
    leave: 0,
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const row of grouped) {
    const day = byDate.get(row._id.date);
    if (day) addStatus(day, row._id.status, row.count);
  }

  return {
    month: monthKey,
    start: bounds.start,
    end: bounds.end,
    days,
    topStudents: top,
  };
}
