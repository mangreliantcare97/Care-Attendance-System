import type { Request, Response, NextFunction } from 'express';
import { z, type ZodType } from 'zod';
import { fail } from '../utils/response.ts';

type Source = 'body' | 'query' | 'params';

function formatIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validate one part of the request against a zod schema.
 *
 * The parsed result is stored on `req.valid[source]` — the raw request objects
 * are left untouched so that Express' own parsing stays predictable.
 */
export function validate(schema: ZodType, source: Source = 'body', status = 422) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      fail(res, status, 'validation_error', 'The submitted data is invalid.', formatIssues(result.error));
      return;
    }
    req.valid = { ...req.valid, [source]: result.data };
    next();
  };
}
