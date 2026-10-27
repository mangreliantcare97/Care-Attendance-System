import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform } from './plugins.ts';
import { normaliseNameKey } from '../utils/text.ts';
import { normalisePostcode } from '../utils/postcode.ts';

/**
 * A physical place where people can check in.
 *
 * `name` is the full address label exactly as the administrator typed it, and
 * it is what the public form shows. `nameKey` is the case-folded form used by
 * the unique rule: the same label may exist at two postcodes, and one postcode
 * may hold several labels (33 and 35 Chandos Road both sit at HA1 4QX).
 *
 * `active` defaults to true; documents written before the field existed are
 * migrated to `active: true` by `ensureActiveFlags`.
 *
 * Public check-in only ever sees the id and name of active locations.
 */
const locationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
    nameKey: { type: String, required: true, trim: true },
    postcode: { type: String, required: true, trim: true, set: normalisePostcode },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

locationSchema.pre('validate', function () {
  this.nameKey = normaliseNameKey(this.name ?? '');
});

locationSchema.index({ nameKey: 1, postcode: 1 }, { unique: true });
locationSchema.index({ active: 1, sortOrder: 1, name: 1 });

applyJsonTransform(locationSchema);

export type Location = InferSchemaType<typeof locationSchema>;

export const LocationModel = model('Location', locationSchema);
