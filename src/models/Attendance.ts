import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform, DATE_PATTERN, TIME_PATTERN } from './plugins.ts';

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'on_leave', 'vacation'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** `manual` rows are owned by an admin, `leave_sync` rows are generated from a leave. */
export const ATTENDANCE_SOURCES = ['manual', 'leave_sync'] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

/**
 * One attendance row per student per calendar day.
 *
 * `date` is a plain `YYYY-MM-DD` string — the calendar day is a fact about the
 * calendar, not an instant in time, so it must not shift with the server's UTC
 * offset. The unique index below is what the spec calls for.
 */
const attendanceSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: String, required: true, match: DATE_PATTERN },
    status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
    checkIn: { type: String, default: null, match: TIME_PATTERN },
    checkOut: { type: String, default: null, match: TIME_PATTERN },
    note: { type: String, default: '', trim: true },
    source: { type: String, enum: ATTENDANCE_SOURCES, default: 'manual' },
    /**
     * The leave a `leave_sync` row was generated from.
     *
     * Keeping the id makes removal exact: the sync only ever deletes rows that
     * belong to *this* leave. A manual edit clears it (`source` becomes
     * `manual`), so the leave no longer owns the row.
     */
    leaveId: { type: Schema.Types.ObjectId, ref: 'Leave', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

/** One row per student per day. */
attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ source: 1 });
attendanceSchema.index({ source: 1, leaveId: 1 });

applyJsonTransform(attendanceSchema);

export type Attendance = InferSchemaType<typeof attendanceSchema>;

export const AttendanceModel = model('Attendance', attendanceSchema);
