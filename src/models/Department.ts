import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform } from './plugins.ts';

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    location: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

applyJsonTransform(departmentSchema);

export type Department = InferSchemaType<typeof departmentSchema>;

export const DepartmentModel = model('Department', departmentSchema);
