import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform, DATE_PATTERN } from './plugins.ts';

/**
 * Employees are HR records — they never log in.
 *
 * `photo` holds the picture as base64 inside the document. It is deliberately
 * **excluded from every list and aggregation query** (`select('-photo')`) and is
 * only ever served by `GET /api/employees/:id/photo`.
 */
const employeeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Optional contact address. Empty values are stored as `null`. */
    email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      set: (value: string | null | undefined) => {
        if (value === undefined || value === null) return null;
        const normalised = String(value).trim().toLowerCase();
        return normalised === '' ? null : normalised;
      },
    },
    phone: { type: String, default: null, trim: true },
    photo: {
      data: { type: String, default: null },
      mime: { type: String, default: null },
      size: { type: Number, default: null },
    },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    /** Plain text position — the old `jobs` table (with salary ranges) is gone. */
    position: { type: String, default: null, trim: true },
    hireDate: { type: String, default: null, match: DATE_PATTERN },
    /** New employees default to *inactive* — activation is a deliberate act. */
    status: { type: String, enum: ['active', 'inactive', 'terminated'], default: 'inactive', index: true },
  },
  { timestamps: true },
);

/**
 * Unique email, but only for employees that actually have one.
 *
 * A plain `sparse` index would still index explicit `null` values, which would
 * make the second employee without an email fail with a duplicate key error.
 * A partial index restricted to string values keeps `email: null` unindexed.
 */
employeeSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
employeeSchema.index({ name: 1 });

applyJsonTransform(employeeSchema);

export type Employee = InferSchemaType<typeof employeeSchema>;

export const EmployeeModel = model('Employee', employeeSchema);

/** Projection used by every list/aggregation query so photos stay out of the payload. */
export const WITHOUT_PHOTO = '-photo';
