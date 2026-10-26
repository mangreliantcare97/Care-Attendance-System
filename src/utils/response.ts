import type { Response } from 'express';

/** Error carrying an HTTP status and a machine readable code. */
export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>): Response {
  return res.status(200).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ success: true, data });
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}
