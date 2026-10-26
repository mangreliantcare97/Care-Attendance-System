import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform, DATE_PATTERN } from './plugins.ts';

export const LEAVE_TYPES = ['leave', 'vacation', 'time_off'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/**
 * Leave & vacation requests. The old `leaves` + `vacations` tables are merged
 * into this single collection.
 */
const leaveSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    type: { type: String, enum: LEAVE_TYPES, default: 'leave' },
    /** casual | sick | early | annual | unpaid | ... */
    category: { type: String, default: null, trim: true },
    startDate: { type: String, required: true, match: DATE_PATTERN },
    endDate: { type: String, required: true, match: DATE_PATTERN },
    /**
     * Number of **working days** in the inclusive range, according to
     * `WORKING_WEEK` (Monday–Friday by default). A weekend-only range has
     * zero working days.
     */
    days: { type: Number, required: true, min: 0 },
    reason: { type: String, default: '', trim: true },
    status: { type: String, enum: LEAVE_STATUSES, default: 'pending', index: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    decidedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

leaveSchema.index({ studentId: 1, startDate: 1 });
leaveSchema.index({ startDate: 1, endDate: 1 });
/** The overlap rule only ever looks at approved leaves. */
leaveSchema.index({ studentId: 1, status: 1, startDate: 1, endDate: 1 });

applyJsonTransform(leaveSchema);

export type Leave = InferSchemaType<typeof leaveSchema>;

export const LeaveModel = model('Leave', leaveSchema);
