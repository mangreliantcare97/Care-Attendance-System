/** Escape a value for safe use in HTML text or an attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/**
 * Remove anything that could break out of a mail header.
 *
 * A subject or a recipient that contains CR/LF would allow an attacker to add
 * arbitrary headers (or a second recipient) to the message.
 */
export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** A very small, permissive email check — enough to catch obvious rubbish. */
export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
