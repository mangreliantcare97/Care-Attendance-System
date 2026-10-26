/**
 * CSV export.
 *
 * Two things matter here:
 *  - a cell that starts with `=`, `+`, `-` or `@` is prefixed with an
 *    apostrophe, so a spreadsheet application cannot execute it as a formula
 *  - cells that contain a comma, a quote or a newline are quoted
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);

  if (FORMULA_START.test(text)) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/** Build a CSV document from a header row and a list of rows. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];

  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }

  // A byte order mark makes Excel read the file as UTF-8.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
