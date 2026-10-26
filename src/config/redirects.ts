import { PAGES } from './pages.ts';

/** Where a sign-in lands when there is no useful protected page to return to. */
export const DEFAULT_AFTER_LOGIN = '/dashboard.html';

/**
 * The pages a post-login redirect may point at.
 *
 * Only the server's protected page allowlist is accepted. The login and
 * password-reset pages are deliberately absent, so `next` can never bounce a
 * signed-in administrator back to an unauthenticated screen.
 */
const PROTECTED_PAGE_PATHS = new Set(
  PAGES.filter((page) => !page.public).map((page) => `/${page.file}`),
);

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const MAX_NEXT_LENGTH = 2048;

/**
 * Validate a post-login `next` value.
 *
 * A safe value is a local path to a protected page, optionally followed by a
 * query string. Anything that browsers might interpret as another origin
 * (`//host`, `/\host`, a scheme) is rejected. The input is expected to have
 * been URL-decoded once by the query parser; decoding it again would make
 * double-encoded open redirects possible.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_NEXT_LENGTH) {
    return DEFAULT_AFTER_LOGIN;
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_AFTER_LOGIN;
  }

  // Backslashes, control characters and every scheme separator are never
  // needed in a protected page path. Reject them before parsing anything.
  if (CONTROL_CHARS.test(value) || value.includes('\\') || value.includes(':') || value.includes('#')) {
    return DEFAULT_AFTER_LOGIN;
  }

  const queryIndex = value.indexOf('?');
  const path = queryIndex === -1 ? value : value.slice(0, queryIndex);

  return PROTECTED_PAGE_PATHS.has(path) ? value : DEFAULT_AFTER_LOGIN;
}
