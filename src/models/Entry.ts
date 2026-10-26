import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform } from './plugins.ts';

export const ENTRY_DIRECTIONS = ['in', 'out'] as const;
export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];

/** One public check-in or check-out. No admin account is involved. */
const entrySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    direction: { type: String, enum: ENTRY_DIRECTIONS, required: true },
    occurredAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

entrySchema.index({ occurredAt: -1 });
entrySchema.index({ locationId: 1, occurredAt: -1 });

applyJsonTransform(entrySchema);

export type Entry = InferSchemaType<typeof entrySchema>;

export const EntryModel = model('Entry', entrySchema);
