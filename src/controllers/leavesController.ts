import type { Request, Response } from 'express';
import { z } from 'zod';
import * as leaves from '../services/leaves.ts';
import * as allowances from '../services/allowances.ts';
import { LEAVE_STATUSES, LEAVE_TYPES } from '../models/Leave.ts';
import { ok } from '../utils/response.ts';
import { toCsv } from '../utils/csv.ts';
import { isDateString } from '../utils/dates.ts';

const dateString = z.string().refine(isDateString, 'That is not a valid date.');

const idString = z.string().regex(/^[a-f\d]{24}$/i, 'That id is not valid.');

export const leaveIdSchema = z.object({ id: idString });

export const leaveQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  employeeId: idString.optional(),
  departmentId: idString.optional(),
  type: z.enum(LEAVE_TYPES).optional(),
  status: z.enum(LEAVE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

export const createLeaveSchema = z.object({
  employeeId: idString,
  type: z.enum(LEAVE_TYPES),
  category: z.string().trim().max(60).nullish(),
  startDate: dateString,
  endDate: dateString,
  reason: z.string().trim().max(1000).nullish(),
  status: z.enum(LEAVE_STATUSES).optional(),
  confirmOverAllowance: z.boolean().optional(),
});

export const updateLeaveSchema = createLeaveSchema.partial();

const optionalPositiveInt = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(max).optional(),
  );

export const previewLeaveQuerySchema = z
  .object({
    employeeId: idString,
    type: z.enum(LEAVE_TYPES),
    startDate: dateString,
    endDate: dateString,
    excludeLeaveId: idString.optional(),
  })
  .refine((query) => query.endDate >= query.startDate, {
    path: ['endDate'],
    message: 'The end date cannot be before the start date.',
  });

export const allowanceQuerySchema = z.object({
  year: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(2000).max(2100).optional(),
  ),
  departmentId: idString.optional(),
  search: z.string().trim().max(120).optional(),
  month: optionalPositiveInt(12),
  page: optionalPositiveInt(1000),
  perPage: optionalPositiveInt(100),
});

export async function index(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof leaveQuerySchema>;
  const result = await leaves.listLeaves(query);
  ok(res, { leaves: result.leaves }, result.meta as unknown as Record<string, unknown>);
}

export async function show(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof leaveIdSchema>;
  ok(res, { leave: await leaves.getLeave(id) });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createLeaveSchema>;
  ok(res, { leave: await leaves.createLeave(body, req.admin!.id) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof leaveIdSchema>;
  const body = req.valid.body as z.infer<typeof updateLeaveSchema>;
  ok(res, { leave: await leaves.updateLeave(id, body, req.admin!.id) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof leaveIdSchema>;
  ok(res, await leaves.deleteLeave(id));
}

/** The live "what would this leave count?" hint of the leave form. */
export async function preview(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof previewLeaveQuerySchema>;
  ok(res, { preview: await allowances.previewLeave(query) });
}

/** Every active employee with their holiday allowance, paginated. */
export async function allowancesIndex(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof allowanceQuerySchema>;
  const result = await allowances.listAllowances(query);
  ok(
    res,
    {
      allowances: result.allowances,
      year: result.year,
      month: result.month,
      monthTotals: result.monthTotals,
      remainingHeading: allowances.allowanceRemainingHeading(result.year),
      expiredNote: allowances.allowanceExpiredNote(result.year),
    },
    result.meta as unknown as Record<string, unknown>,
  );
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The whole filtered allowance overview as CSV (never just one page). */
export async function allowancesCsv(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof allowanceQuerySchema>;
  const result = await allowances.allowanceRows(query);

  const headers = [
    'Employee',
    'Department',
    'Position',
    'Year',
    'Holiday allowance',
    'Total',
    'Holiday used',
    'Pending',
    allowances.allowanceRemainingHeading(result.year),
  ];
  if (result.month) headers.push(`Used in ${MONTH_NAMES[result.month - 1]}`);

  const data = result.rows.map((row) => {
    const cells: unknown[] = [
      row.name,
      row.department ?? '',
      row.position ?? '',
      row.year,
      row.allowance,
      row.total,
      row.used,
      row.pending,
      row.remaining,
    ];
    if (result.month) cells.push(row.usedInMonth ?? 0);
    return cells;
  });

  const csv = toCsv(headers, data);

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set(
    'Content-Disposition',
    `attachment; filename="holiday-allowances-${result.year}${result.month ? `-${String(result.month).padStart(2, '0')}` : ''}.csv"`,
  );
  res.send(csv);
}

/** The leave list as a CSV file. */
export async function exportCsv(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof leaveQuerySchema>;
  const rows = (await leaves.leaveRows(query)) as Array<Record<string, unknown>>;

  const data = rows.map((leave) => {
    const employee = (leave.employeeId ?? {}) as Record<string, unknown>;
    const department = (employee.departmentId ?? {}) as Record<string, unknown>;

    return [
      employee.name ?? '',
      department.name ?? '',
      leave.type,
      leave.category ?? '',
      leave.startDate,
      leave.endDate,
      leave.days,
      leave.status,
      leave.reason ?? '',
    ];
  });

  const csv = toCsv(
    ['Employee', 'Department', 'Type', 'Category', 'From', 'To', 'Working days', 'Status', 'Reason'],
    data,
  );

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="leaves-${Date.now()}.csv"`);
  res.send(csv);
}
