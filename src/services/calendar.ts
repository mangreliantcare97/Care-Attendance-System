import { Types } from 'mongoose';
import { EventModel, type EventType } from '../models/Event.ts';
import { LeaveModel, type LeaveType } from '../models/Leave.ts';
import { HttpError } from '../utils/response.ts';
import { addDays, diffDays } from '../utils/dates.ts';
import { reconcileLeaves } from './attendanceSync.ts';

/** The largest range the calendar feed will answer, in calendar days. */
export const MAX_CALENDAR_RANGE_DAYS = 400;

const LEAVE_LABELS: Record<LeaveType, string> = {
  leave: 'Leave',
  vacation: 'Vacation',
  time_off: 'Time off',
};

export interface EventPayload {
  title: string;
  description?: string | null;
  type: EventType;
  startDate: string;
  endDate?: string | null;
}

export interface CalendarItem {
  id: string;
  kind: 'hr' | 'leave';
  type: EventType | LeaveType;
  title: string;
  description: string;
  /** Inclusive, exactly as stored. */
  startDate: string;
  endDate: string;
  /** FullCalendar values: all-day, date-only, with an **exclusive** end. */
  start: string;
  end: string;
  allDay: true;
  url?: string;
  studentId?: string;
  studentName?: string;
}

function assertEventRange(startDate: string, endDate: string): void {
  if (endDate < startDate) {
    throw new HttpError(422, 'event_range_invalid', 'The end date cannot be before the start date.');
  }
}

/**
 * Recompute the stored days and the attendance rows of every leave that
 * overlaps a holiday range.
 *
 * Called after a `holiday` event was created, edited or deleted: a bank
 * holiday makes the working days it covers stop counting, so the affected
 * leaves must be re-counted in the same request.
 */
async function reconcileLeavesInHolidayRange(start: string, end: string): Promise<void> {
  const leaves = await LeaveModel.find({
    startDate: { $lte: end },
    endDate: { $gte: start },
  })
    .select('_id')
    .sort({ _id: 1 })
    .lean();

  if (leaves.length > 0) {
    await reconcileLeaves(leaves.map((leave) => String(leave._id)));
  }
}

/**
 * The calendar feed: HR events plus approved leaves, merged at query time.
 *
 * The range is validated and capped so a single request cannot ask the server
 * to materialise years of leaves. Both dates are inclusive query bounds; every
 * returned item carries FullCalendar's exclusive `end` (inclusive end + 1 day).
 */
export async function calendarFeed(start: string, end: string): Promise<CalendarItem[]> {
  if (end < start) {
    throw new HttpError(422, 'calendar_range_invalid', 'The end date cannot be before the start date.');
  }

  if (diffDays(start, end) + 1 > MAX_CALENDAR_RANGE_DAYS) {
    throw new HttpError(
      422,
      'calendar_range_too_long',
      `The calendar can show at most ${MAX_CALENDAR_RANGE_DAYS} days at a time.`,
    );
  }

  const [events, leaves] = await Promise.all([
    EventModel.find({
      startDate: { $lte: end },
      $or: [{ endDate: { $gte: start } }, { endDate: null }],
    }).sort({ startDate: 1, createdAt: 1 }),
    LeaveModel.find({
      status: 'approved',
      startDate: { $lte: end },
      endDate: { $gte: start },
    })
      .populate('studentId', 'name')
      .sort({ startDate: 1, createdAt: 1 }),
  ]);

  const items: CalendarItem[] = [];

  for (const event of events) {
    const inclusiveEnd = event.endDate || event.startDate;

    items.push({
      id: String(event._id),
      kind: 'hr',
      type: event.type as EventType,
      title: event.title,
      description: event.description ?? '',
      startDate: event.startDate,
      endDate: inclusiveEnd,
      start: event.startDate,
      end: addDays(inclusiveEnd, 1),
      allDay: true,
    });
  }

  for (const leave of leaves) {
    const student = leave.studentId as unknown as { _id: unknown; name?: string } | null;
    const studentId = student?._id ? String(student._id) : String(leave.studentId);
    const studentName = student?.name ?? 'Student';
    const type = leave.type as LeaveType;
    const label = LEAVE_LABELS[type] ?? 'Leave';

    items.push({
      id: String(leave._id),
      kind: 'leave',
      type,
      title: `${studentName} — ${label}`,
      description: `${label} for ${studentName}, ${leave.startDate} to ${leave.endDate}`,
      startDate: leave.startDate,
      endDate: leave.endDate,
      start: leave.startDate,
      end: addDays(leave.endDate, 1),
      allDay: true,
      url: '/leaves.html',
      studentId,
      studentName,
    });
  }

  return items.sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export async function createEvent(payload: EventPayload, adminId: string): Promise<unknown> {
  const endDate = payload.endDate ?? payload.startDate;
  assertEventRange(payload.startDate, endDate);

  const event = await EventModel.create({
    title: payload.title.trim(),
    description: payload.description?.trim() || '',
    type: payload.type,
    startDate: payload.startDate,
    endDate,
    createdBy: new Types.ObjectId(adminId),
    updatedBy: new Types.ObjectId(adminId),
  });

  if (event.type === 'holiday') {
    await reconcileLeavesInHolidayRange(event.startDate, event.endDate);
  }

  return event;
}

export async function updateEvent(
  id: string,
  payload: Partial<EventPayload>,
  adminId: string,
): Promise<unknown> {
  const event = await EventModel.findById(id);
  if (!event) {
    throw new HttpError(404, 'event_not_found', 'That calendar event no longer exists.');
  }

  const previousType = event.type as EventType;
  const previousStart = event.startDate;
  const previousEnd = event.endDate;

  if (payload.title !== undefined) event.title = payload.title.trim();
  if (payload.description !== undefined) event.description = payload.description?.trim() || '';
  if (payload.type !== undefined) event.type = payload.type;
  if (payload.startDate !== undefined) event.startDate = payload.startDate;
  if (payload.endDate !== undefined) event.endDate = payload.endDate ?? event.startDate;

  assertEventRange(event.startDate, event.endDate);
  event.updatedBy = new Types.ObjectId(adminId);

  await event.save();

  // A holiday change affects both the old and the new range: editing a
  // holiday must re-count the leaves it used to cover and the ones it covers
  // now. A change to or from the holiday type does the same.
  if (previousType === 'holiday' || event.type === 'holiday') {
    const rangeStart = previousStart < event.startDate ? previousStart : event.startDate;
    const rangeEnd = previousEnd > event.endDate ? previousEnd : event.endDate;
    await reconcileLeavesInHolidayRange(rangeStart, rangeEnd);
  }

  return event;
}

export async function deleteEvent(id: string): Promise<{ deleted: boolean }> {
  const event = await EventModel.findById(id);
  if (!event) {
    throw new HttpError(404, 'event_not_found', 'That calendar event no longer exists.');
  }

  const wasHoliday = event.type === 'holiday';
  const start = event.startDate;
  const end = event.endDate;

  await event.deleteOne();

  // Removing a holiday makes its working days count again.
  if (wasHoliday) {
    await reconcileLeavesInHolidayRange(start, end);
  }

  return { deleted: true };
}
