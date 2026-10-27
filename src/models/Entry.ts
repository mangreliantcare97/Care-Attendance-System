import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform } from './plugins.ts';
import { normaliseNameKey } from '../utils/text.ts';

export const ENTRY_USER_TYPES = ['staff', 'service_user', 'visitor'] as const;
export type EntryUserType = (typeof ENTRY_USER_TYPES)[number];

export const ENTRY_DIRECTIONS = ['in', 'out'] as const;
export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];

/** UK facing labels for the public form and the admin pages. */
export const USER_TYPE_LABELS: Record<EntryUserType, string> = {
  staff: 'Staff Member',
  service_user: 'Service User',
  visitor: 'Visitor',
};

export const DIRECTION_LABELS: Record<EntryDirection, string> = {
  in: 'Check in',
  out: 'Check out',
};

const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One public check-in or check-out.
 *
 * `enteredTime` is what the person chose (24h `HH:mm`), `date` is the calendar
 * day the server decided in `APP_TIMEZONE`, and `receivedAt` is the server
 * clock — the gap between the first two and the last one is what the admin
 * "time mismatch" flag reports.
 *
 * IP addresses are deliberately never stored.
 */
const entrySchema = new Schema(
  {
    userType: { type: String, enum: ENTRY_USER_TYPES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, trim: true },
    direction: { type: String, enum: ENTRY_DIRECTIONS, required: true },
    enteredTime: { type: String, required: true, match: CLOCK_PATTERN },
    date: { type: String, required: true, match: DATE_PATTERN },
    receivedAt: { type: Date, required: true, default: () => new Date() },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    notes: { type: String, required: true, trim: true, maxlength: 500 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

entrySchema.pre('validate', function () {
  this.nameKey = normaliseNameKey(this.name ?? '');
});

entrySchema.index({ date: -1, enteredTime: -1 });
entrySchema.index({ userType: 1 });
entrySchema.index({ locationId: 1 });
entrySchema.index({ nameKey: 1, date: 1 });

applyJsonTransform(entrySchema);

export type Entry = InferSchemaType<typeof entrySchema>;

export const EntryModel = model('Entry', entrySchema);

/** Soft-deleted entries are excluded from every query. */
export const NOT_DELETED = { deletedAt: null };
