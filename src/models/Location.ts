import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform } from './plugins.ts';

/**
 * A physical place where staff can check in.
 *
 * Public check-in only ever sees the id and name of active locations. The
 * administrative fields stay behind the authenticated API.
 */
const locationSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
    note: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

locationSchema.index({ isActive: 1, name: 1 });

applyJsonTransform(locationSchema);

export type Location = InferSchemaType<typeof locationSchema>;

export const LocationModel = model('Location', locationSchema);
