import type { Schema } from 'mongoose';

/** Extra transformation applied to the JSON output of a document. */
export type JsonTransform = (ret: Record<string, unknown>) => void;

/**
 * Normalise every document to JSON:
 *  - expose `id` (string) instead of the raw `_id`
 *  - drop the mongoose `__v` version key
 */
export function applyJsonTransform(schema: Schema, extra?: JsonTransform): void {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      extra?.(ret);
      return ret;
    },
  });
}

/** Matches an ISO calendar date, i.e. `YYYY-MM-DD`. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Matches a 24 hour clock time, i.e. `HH:mm`. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
