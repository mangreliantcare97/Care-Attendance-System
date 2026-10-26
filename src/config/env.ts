import 'dotenv/config';

/** Read a required string variable, throwing when it is missing. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function int(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${value}"`);
  }
  return parsed;
}

/**
 * Parse the working-week configuration into ISO weekday numbers (1 = Monday .. 7 = Sunday).
 * Defaults to Monday-Friday.
 */
function parseWorkingWeek(raw: string): number[] {
  const days = raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  if (days.length === 0) {
    throw new Error(`WORKING_WEEK must list at least one ISO weekday (1-7), got "${raw}"`);
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

const nodeEnv = str('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

/** The mail providers we know about. */
export type MailProvider = 'none' | 'console' | 'cloudflare';

function mailProvider(raw: string): MailProvider {
  const value = raw.trim().toLowerCase();
  if (value === '' || value === 'none' || value === 'console' || value === 'cloudflare') {
    return value === '' ? 'none' : (value as MailProvider);
  }
  throw new Error(`MAIL_PROVIDER must be one of: none, console, cloudflare — got "${raw}"`);
}

export const env = {
  nodeEnv,
  isProduction,
  isTest,
  port: int('PORT', 3000),
  appUrl: str('APP_URL', `http://localhost:${int('PORT', 3000)}`),

  /** IANA timezone used for every calendar-day calculation. */
  appTimezone: str('APP_TIMEZONE', 'Europe/London'),

  mongodbUri: str('MONGODB_URI', 'mongodb://127.0.0.1:27017/lean-hrm'),

  sessionSecret: isProduction ? required('SESSION_SECRET') : str('SESSION_SECRET', 'dev-only-insecure-session-secret'),
  sessionCookieName: str('SESSION_COOKIE_NAME', 'hrm.sid'),
  sessionTtlMinutes: int('SESSION_TTL_MINUTES', 480),

  trustProxy: int('TRUST_PROXY', 1),

  /** ISO weekday numbers (1 = Monday .. 7 = Sunday) that count as working days. */
  workingWeek: parseWorkingWeek(str('WORKING_WEEK', '1,2,3,4,5')),

  /**
   * Holiday allowance in working days per student and calendar year.
   *
   * A missing `leaveAllowances` row uses this value. Unused days expire on
   * 31 December; there is no carry-over.
   * Holiday events are excluded from the counted days, so the allowance is
   * deliberately on top of bank/company holidays.
   */
  annualAllowanceDefault: Number(str('ANNUAL_ALLOWANCE_DEFAULT', '28')),

  loginRateLimit: {
    windowMs: int('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15) * 60 * 1000,
    max: int('LOGIN_RATE_LIMIT_MAX', 10),
  },

  /**
   * The public address of the app. Used to build the links in the mails —
   * never taken from the request headers, so a forged `Host` cannot poison a
   * password reset link.
   */
  appBaseUrl: str('APP_BASE_URL', str('APP_URL', `http://localhost:${int('PORT', 3000)}`)).replace(/\/+$/, ''),

  mail: {
    provider: mailProvider(str('MAIL_PROVIDER', 'none')),
    /** `name <address@example.com>` or just `address@example.com`. */
    from: str('MAIL_FROM', ''),
    cloudflareAccountId: str('CLOUDFLARE_ACCOUNT_ID', ''),
    cloudflareApiToken: str('CLOUDFLARE_EMAIL_API_TOKEN', ''),
  },

  passwordReset: {
    /** How long a reset link stays valid. */
    ttlMinutes: int('PASSWORD_RESET_TTL_MINUTES', 30),
    /** Attempts per window and IP for the password endpoints. */
    rateLimitWindowMs: int('PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES', 15) * 60 * 1000,
    rateLimitMax: int('PASSWORD_RESET_RATE_LIMIT_MAX', 5),
  },

  seedAdmin: {
    name: str('SEED_ADMIN_NAME', 'Administrator'),
    email: str('SEED_ADMIN_EMAIL', ''),
    password: str('SEED_ADMIN_PASSWORD', ''),
  },

  studentPhotoMaxBytes: int('STUDENT_PHOTO_MAX_BYTES', 256 * 1024),
} as const;

export type Env = typeof env;
