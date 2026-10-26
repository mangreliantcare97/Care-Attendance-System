/** UK postcode helpers: store one canonical form, validate leniently. */

/**
 * Uppercase and reduce a postcode to one space before the final three
 * characters: `ha14qx` -> `HA1 4QX`, `HA1  4QX` -> `HA1 4QX`.
 */
export function normalisePostcode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/**
 * Lenient UK postcode check.
 *
 * The outward code is one or two letters, a digit and an optional letter or
 * digit; the inward code is a digit and two letters. `GIR 0AA` is the one
 * special case. Anything else is refused with "Enter a valid UK postcode".
 */
const UK_POSTCODE = /^(?:GIR 0AA|[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2})$/;

export function isValidUkPostcode(value: string): boolean {
  return UK_POSTCODE.test(normalisePostcode(value));
}
