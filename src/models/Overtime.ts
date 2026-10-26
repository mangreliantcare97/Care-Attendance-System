import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform, DATE_PATTERN } from './plugins.ts';

/** Overtime is a real calendar day (`YYYY-MM-DD`), not a timestamp. */
const overtimeSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true, match: DATE_PATTERN },
    hours: {
      type: Number,
      required: true,
      min: 0.25,
      max: 24,
      /** Hours are booked in quarter-hour steps. */
      validate: {
        validator: (value: number) => Math.abs(value * 4 - Math.round(value * 4)) < 1e-9,
        message: 'Hours must be a multiple of 0.25.',
      },
    },
    note: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

overtimeSchema.index({ employeeId: 1, date: 1 });
overtimeSchema.index({ date: 1 });

applyJsonTransform(overtimeSchema);

export type Overtime = InferSchemaType<typeof overtimeSchema>;

export const OvertimeModel = model('Overtime', overtimeSchema);
