import { env } from '../config/env.ts';
import { isEmailLike, sanitizeHeader } from '../utils/escape.ts';

/**
 * The mail interface.
 *
 * Only one implementation is needed by the application; the provider is chosen
 * by the `MAIL_PROVIDER` environment variable.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Optional reply-to address (snake_cased by the Cloudflare REST API). */
  replyTo?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** `name <address@example.com>` or `address@example.com`. */
export interface ParsedAddress {
  address: string;
  name: string | null;
}

export function parseAddress(value: string): ParsedAddress {
  const match = /^\s*([^<]*)<([^>]+)>\s*$/.exec(value);
  if (match) {
    return { name: match[1].trim() || null, address: match[2].trim() };
  }
  return { name: null, address: value.trim() };
}

/** No-op provider — the default, so a fresh installation never sends mail. */
export const noneMailer: Mailer = {
  async send() {
    /* intentionally empty */
  },
};

/** Development provider: prints the message (including the reset link). */
export const consoleMailer: Mailer = {
  async send(message) {
    console.info(
      [
        '',
        '-------- mail (console provider) --------',
        `to:      ${sanitizeHeader(message.to)}`,
        `subject: ${sanitizeHeader(message.subject)}`,
        'body:',
        message.text,
        '----------------------------------------',
        '',
      ].join('\n'),
    );
  },
};

export interface CloudflareMailerOptions {
  accountId: string;
  apiToken: string;
  from: string;
  /** Overridable so the tests can mock the HTTP call. */
  fetchImpl?: typeof fetch;
}

/**
 * Cloudflare Email Service (REST API).
 *
 * Endpoint: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send
 * Auth:     Authorization: Bearer <api token>
 *
 * The REST payload differs from the Workers binding:
 *  - `from` is an object keyed by `address` (the binding uses `email`)
 *  - `reply_to` is snake_case
 *
 * See https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
 */
export function createCloudflareMailer(options: CloudflareMailerOptions): Mailer {
  const doFetch = options.fetchImpl ?? fetch;
  const from = parseAddress(options.from);

  return {
    async send(message) {
      if (!options.accountId || !options.apiToken || !from.address) {
        throw new Error(
          'The cloudflare mail provider is not configured (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_API_TOKEN and MAIL_FROM are required).',
        );
      }

      const to = sanitizeHeader(message.to);
      if (!isEmailLike(to)) {
        throw new Error(`Refusing to send a mail to "${to}" — not a valid address.`);
      }

      const payload: Record<string, unknown> = {
        to: [to],
        subject: sanitizeHeader(message.subject),
        text: message.text,
        html: message.html,
      };

      // The REST API accepts a plain address or a named one.
      payload.from = from.name ? { address: from.address, name: from.name } : from.address;

      const replyTo = message.replyTo ? sanitizeHeader(message.replyTo) : from.address;
      if (replyTo && isEmailLike(replyTo)) {
        payload.reply_to = replyTo;
      }

      const response = await doFetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/email/sending/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Cloudflare refused the mail (HTTP ${response.status}): ${body.slice(0, 500)}`);
      }
    },
  };
}

/** Build the mailer that the `MAIL_PROVIDER` variable selects. */
export function createMailer(): Mailer {
  switch (env.mail.provider) {
    case 'console':
      return consoleMailer;
    case 'cloudflare':
      return createCloudflareMailer({
        accountId: env.mail.cloudflareAccountId,
        apiToken: env.mail.cloudflareApiToken,
        from: env.mail.from,
      });
    default:
      return noneMailer;
  }
}

let instance: Mailer | null = null;

/** The mailer the application uses. */
export function getMailer(): Mailer {
  if (!instance) {
    instance = createMailer();
  }
  return instance;
}

/** Replace the mailer (the tests use this to capture the sent messages). */
export function setMailer(mailer: Mailer | null): void {
  instance = mailer;
}

/**
 * Send a mail without letting a failure reach the caller.
 *
 * The request that triggered the mail must always answer the same way, so a
 * broken provider is logged on the server and nowhere else.
 */
export function sendQuietly(mailer: Mailer, message: MailMessage): void {
  void mailer.send(message).catch((error) => {
    console.error('[mail] the message could not be sent:', error instanceof Error ? error.message : error);
  });
}
