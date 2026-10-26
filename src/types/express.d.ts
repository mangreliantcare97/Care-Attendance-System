import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Payload parsed and validated by the `validate` middleware. */
    valid: {
      body?: unknown;
      query?: unknown;
      params?: unknown;
    };
    /** The signed-in admin, populated by `requireAuth`. */
    admin?: {
      id: string;
      name: string;
      email: string;
      role: 'admin';
      isActive: boolean;
    };
  }
}

declare module 'express-session' {
  interface SessionData {
    /** `_id` of the signed-in admin. */
    adminId?: string;
    /** Double-submit CSRF token issued at login. */
    csrfToken?: string;
  }
}

export {};
