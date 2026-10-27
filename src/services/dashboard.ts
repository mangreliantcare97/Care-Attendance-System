import { EntryModel, NOT_DELETED, type EntryDirection, type EntryUserType } from '../models/Entry.ts';
import { LocationModel } from '../models/Location.ts';
import { listEntries } from './entries.ts';
import { addDays, eachDate, today } from '../utils/dates.ts';
import { env } from '../config/env.ts';

interface DailyCount {
  _id: string;
  count: number;
}

interface TodayCount {
  _id: { direction: EntryDirection; userType: EntryUserType };
  count: number;
}

/** Summary metrics and chart series for the administrator dashboard. */
export async function getDashboardSummary(now: Date = new Date()) {
  const currentDate = today(env.appTimezone, now);
  const firstTrendDate = addDays(currentDate, -6);

  const [todayCounts, trendCounts, activeLocations, recentResult] = await Promise.all([
    EntryModel.aggregate<TodayCount>([
      { $match: { ...NOT_DELETED, date: currentDate } },
      {
        $group: {
          _id: { direction: '$direction', userType: '$userType' },
          count: { $sum: 1 },
        },
      },
    ]),
    EntryModel.aggregate<DailyCount>([
      { $match: { ...NOT_DELETED, date: { $gte: firstTrendDate, $lte: currentDate } } },
      { $group: { _id: '$date', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    LocationModel.countDocuments({ active: { $ne: false } }),
    listEntries({ page: 1, perPage: 5, sort: 'date', order: 'desc' }),
  ]);

  const directionTotals: Record<EntryDirection, number> = { in: 0, out: 0 };
  const userTypeTotals: Record<EntryUserType, number> = {
    staff: 0,
    service_user: 0,
    visitor: 0,
  };
  for (const row of todayCounts) {
    directionTotals[row._id.direction] += row.count;
    userTypeTotals[row._id.userType] += row.count;
  }

  const trendByDate = new Map(trendCounts.map((row) => [row._id, row.count]));
  const trend = eachDate(firstTrendDate, currentDate).map((date) => ({
    date,
    count: trendByDate.get(date) ?? 0,
  }));
  const totalToday = directionTotals.in + directionTotals.out;

  return {
    date: currentDate,
    metrics: {
      entriesToday: totalToday,
      checkInsToday: directionTotals.in,
      checkOutsToday: directionTotals.out,
      activeLocations,
    },
    trend,
    todayByUserType: [
      { userType: 'staff' as const, count: userTypeTotals.staff },
      { userType: 'service_user' as const, count: userTypeTotals.service_user },
      { userType: 'visitor' as const, count: userTypeTotals.visitor },
    ],
    recentEntries: recentResult.entries,
  };
}
