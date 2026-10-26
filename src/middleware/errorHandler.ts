import type { Request, Response, NextFunction } from 'express';
import { HttpError, fail } from '../utils/response.ts';

/** 404 handler — JSON for the API, plain text for pages. */
export function notFound(req: Request, res: Response): void {
  if (req.path.startsWith('/api/')) {
    fail(res, 404, 'not_found', 'The requested endpoint does not exist.');
    return;
  }
  res.status(404).type('text/plain').send('Page not found');
}

/** Central error handler. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    fail(res, error.status, error.code, error.message, error.details);
    return;
  }

  // Duplicate key errors (e.g. the unique email index) are a user problem.
  const mongoError = error as { code?: number; keyValue?: Record<string, unknown> };
  if (mongoError?.code === 11000) {
    const field = Object.keys(mongoError.keyValue ?? {})[0] ?? 'value';
    fail(res, 409, 'duplicate_key', `That ${field} is already in use.`);
    return;
  }

  if (error instanceof Error && error.name === 'ValidationError') {
    fail(res, 422, 'validation_error', error.message);
    return;
  }

  // Body parser errors (malformed JSON, payload too large, …) carry their own
  // status code and are the client's fault, not ours.
  const clientError = error as { type?: string; status?: number; statusCode?: number };
  const status = clientError.status ?? clientError.statusCode;
  if (clientError.type === 'entity.parse.failed') {
    fail(res, 400, 'invalid_json', 'The request body is not valid JSON.');
    return;
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    fail(res, status, 'bad_request', error instanceof Error ? error.message : 'The request could not be processed.');
    return;
  }

  console.error('[error]', error);
  fail(res, 500, 'server_error', 'Something went wrong on our side. Please try again.');
}
