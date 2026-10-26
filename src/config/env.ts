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

/** Read a required positive integer. */
function positiveInt(name: string, fallback: number): number {
  const value = int(name, fallback);
  if (value <= 0) {
    throw new Error(`Environment variable ${name} must be greater than zero, got "${value}"`);
  }
  return value;
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

  mongodbUri: str('MONGODB_URI', 'mongodb://127.0.0.1:27017/care-attendance'),

  /** Required in every environment. Generate a new value for this project. */
  sessionSecret: required('SESSION_SECRET'),
  sessionCookieName: str('SESSION_COOKIE_NAME', 'care.sid'),
  /**
   * Session lifetime. The session is rolling, so every request refreshes the
   * window; a session that stays unused for this many hours expires.
   */
  sessionMaxHours: positiveInt('SESSION_MAX_HOURS', 12),

  trustProxy: int('TRUST_PROXY', 1),

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
} as const;

export type Env = typeof env;
