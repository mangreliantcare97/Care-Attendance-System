import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform, DATE_PATTERN } from './plugins.ts';

/**
 * HR calendar entries. Leave and vacation are **not** events — they live in the
 * `leaves` collection and are merged into the calendar at query time.
 *
 * Both dates are inclusive `YYYY-MM-DD` strings. The calendar feed converts the
 * inclusive `endDate` to FullCalendar's exclusive end, so a one-day event is
 * stored with `startDate === endDate`. There is deliberately no colour field:
 * the colour is derived from `type` in CSS.
 */
export const EVENT_TYPES = ['holiday', 'deadline', 'meeting', 'event'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    type: { type: String, enum: EVENT_TYPES, default: 'event', index: true },
    startDate: { type: String, required: true, match: DATE_PATTERN },
    /** Inclusive last day. A single-day event has the same value as startDate. */
    endDate: { type: String, required: true, match: DATE_PATTERN },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

eventSchema.index({ startDate: 1, endDate: 1 });

applyJsonTransform(eventSchema);

export type Event = InferSchemaType<typeof eventSchema>;

export const EventModel = model('Event', eventSchema);
