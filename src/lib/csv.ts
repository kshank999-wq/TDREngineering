/**
 * CSV writing, shared by every export.
 *
 * Two things matter here and both are easy to get wrong:
 *
 *   Quoting — RFC 4180, so a description containing a comma, a quote or a
 *   newline survives the round trip into Excel or QuickBooks intact.
 *
 *   Formula injection — a cell beginning `=`, `+`, `-` or `@` is executed by
 *   Excel, Google Sheets and LibreOffice when the file is opened. A client
 *   called "=cmd|..." is a remote-code-execution vector aimed at whoever opens
 *   the export, so those cells get a leading apostrophe.
 */

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/** Builds a complete CSV document, header row first. */
export function toCsv(headers: readonly string[], rows: unknown[][]): string {
  return [csvRow(headers as unknown[]), ...rows.map(csvRow)].join("\r\n");
}

/** A download response with a dated filename. */
export function csvResponse(body: string, basename: string): Response {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${basename}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
