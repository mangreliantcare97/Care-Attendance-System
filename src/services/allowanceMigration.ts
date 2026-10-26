import { LeaveAllowanceModel } from '../models/LeaveAllowance.ts';

export interface AllowanceMigrationResult {
  matched: number;
  modified: number;
}

/**
 * Remove the retired `carryOver` field from every leave-allowance document.
 *
 * The migration is intentionally limited to that one field. It never rewrites
 * the allowance, year, note, creators/timestamps, and it never drops the
 * collection. Running it again is a no-op.
 */
export async function removeCarryOverField(): Promise<AllowanceMigrationResult> {
  const result = await LeaveAllowanceModel.collection.updateMany(
    { carryOver: { $exists: true } },
    { $unset: { carryOver: '' } },
  );

  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  };
}
