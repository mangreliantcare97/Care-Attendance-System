import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform } from './plugins.ts';

/**
 * The holiday allowance of one employee for one calendar year.
 *
 * A missing row is not an error: the employee then has the environment default
 * (`ANNUAL_ALLOWANCE_DEFAULT`, 28 by default). A row only exists once an
 * administrator edits the allowance or the seed creates one.
 *
 * The allowance is a day count in half-day steps. Unused days expire on
 * 31 December: there is no carry-over, so the total is always the allowance.
 * Only approved vacation days consume it.
 */
const leaveAllowanceSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    year: { type: Number, required: true, min: 2000, max: 2100 },
    allowance: { type: Number, required: true, min: 0, max: 100 },
    note: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

leaveAllowanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });

applyJsonTransform(leaveAllowanceSchema);

export type LeaveAllowance = InferSchemaType<typeof leaveAllowanceSchema>;

export const LeaveAllowanceModel = model('LeaveAllowance', leaveAllowanceSchema);
