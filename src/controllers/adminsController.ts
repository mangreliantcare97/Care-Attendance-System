import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  bulkAdmins,
  changeOwnPassword,
  createAdmin,
  deleteAdmin,
  getAdmin,
  listAdmins,
  setAdminActive,
  updateAdmin,
} from '../services/admins.ts';
import { ok } from '../utils/response.ts';

export const adminIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'That admin id is not valid.'),
});

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.').max(255));

const statusSchema = z.enum(['enabled', 'disabled']);

export const listAdminsQuerySchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(255).optional(),
  status: statusSchema.optional(),
  sort: z.enum(['name', 'email', 'status', 'lastLogin']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1, 'Page must be 1 or greater.').default(1),
  perPage: z.coerce
    .number()
    .int()
    .min(1, 'Show at least one admin per page.')
    .max(100, 'Show at most 100 admins per page.')
    .default(20),
});

export const createAdminSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the admin’s name.').max(120),
    email: emailSchema,
    status: statusSchema.default('enabled'),
    password: z.string().min(8, 'Use at least 8 characters.').max(200),
    confirmPassword: z.string().min(1, 'Confirm the password.').max(200),
    // `admin` is the only role that exists. A payload with `viewer` is rejected
    // instead of being silently normalised.
    role: z.literal('admin').default('admin'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const updateAdminSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the admin’s name.').max(120).optional(),
    email: emailSchema.optional(),
    status: statusSchema.optional(),
    // A password may only be set for another administrator. The service
    // enforces that rule; the schema only checks the shape.
    password: z.string().min(8, 'Use at least 8 characters.').max(200).optional(),
    confirmPassword: z.string().max(200).optional(),
    role: z.literal('admin').optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  })
  .superRefine((value, context) => {
    if (value.password !== undefined) {
      if (value.confirmPassword === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['confirmPassword'],
          message: 'Confirm the password.',
        });
      } else if (value.password !== value.confirmPassword) {
        context.addIssue({
          code: 'custom',
          path: ['confirmPassword'],
          message: 'Passwords do not match.',
        });
      }
    } else if (value.confirmPassword !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Enter the new password.',
      });
    }
  });

export const bulkAdminSchema = z.object({
  action: z.enum(['disable', 'delete']),
  ids: z
    .array(z.string().regex(/^[a-f\d]{24}$/i, 'That admin id is not valid.'))
    .min(1, 'Select at least one admin.')
    .max(100, 'Select at most 100 admins.')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Each admin can only appear once.',
    }),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(200),
});

export async function index(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof listAdminsQuerySchema>;
  const result = await listAdmins(query);
  ok(
    res,
    { admins: result.admins },
    {
      total: result.total,
      page: result.page,
      perPage: result.perPage,
      pages: result.pages,
    },
  );
}

export async function show(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof adminIdSchema>;
  ok(res, { admin: await getAdmin(id) });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createAdminSchema>;
  ok(res, {
    admin: await createAdmin({
      name: body.name,
      email: body.email,
      password: body.password,
      status: body.status,
    }),
  });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof adminIdSchema>;
  const body = req.valid.body as z.infer<typeof updateAdminSchema>;
  const result = await updateAdmin(
    id,
    {
      name: body.name,
      email: body.email,
      status: body.status,
      password: body.password,
      role: body.role,
    },
    req.admin!.id,
  );

  ok(res, {
    admin: result.admin,
    revokedSessions: result.revokedSessions,
    passwordChanged: result.passwordChanged,
  });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof adminIdSchema>;
  ok(res, await deleteAdmin(id, req.admin!.id));
}

export async function bulk(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof bulkAdminSchema>;
  ok(res, await bulkAdmins(body.action, body.ids, req.admin!.id));
}

export async function activate(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof adminIdSchema>;
  const result = await setAdminActive(id, true, req.admin!.id);
  ok(res, result);
}

export async function deactivate(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof adminIdSchema>;
  const result = await setAdminActive(id, false, req.admin!.id);
  ok(res, result);
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof changePasswordSchema>;
  await changeOwnPassword(req.admin!.id, body.currentPassword, body.newPassword);
  ok(res, { changed: true });
}
