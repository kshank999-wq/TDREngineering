/**
 * Guards the two things a CSV export has to get right.
 *
 *   npm run check:csv
 *
 * QUOTING — RFC 4180, so a description containing a comma, a quote or a
 * newline survives the round trip into Excel or QuickBooks intact.
 *
 * FORMULA INJECTION — a cell beginning `=`, `+`, `-` or `@` is executed by
 * Excel, Google Sheets and LibreOffice the moment the file is opened. A client
 * name or a line description is attacker-controlled text that ends up in a
 * spreadsheet on somebody's machine, so this is a real vector aimed at whoever
 * opens the export, not a theoretical one.
 */

import { toCsv, csvCell } from "@/lib/csv";

const cases: [string, unknown, string][] = [
  ["plain", "Boundary Survey", '"Boundary Survey"'],
  ["comma", "Survey, ALTA", '"Survey, ALTA"'],
  ["double quote", 'He said "no"', '"He said ""no"""'],
  ["newline", "line1\nline2", '"line1\nline2"'],
  ["formula =", "=cmd|'/c calc'!A1", `"'=cmd|'/c calc'!A1"`],
  ["formula +", "+1+1", `"'+1+1"`],
  ["formula -", "-1+1", `"'-1+1"`],
  ["formula @", "@SUM(A1)", `"'@SUM(A1)"`],
  ["tab", "\tlead", `"'\tlead"`],
  ["null", null, ""],
  ["undefined", undefined, ""],
  ["number", 4850.5, '"4850.5"'],
];

let failures = 0;

for (const [name, input, expected] of cases) {
  const actual = csvCell(input);
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name.padEnd(14)} ${JSON.stringify(actual)}`);
  if (!ok) console.log(`         expected ${JSON.stringify(expected)}`);
}

const doc = toCsv(["a", "b"], [["=BAD()", "x,y"], [1, null]]);
if (!doc.includes(`"'=BAD()"`)) {
  console.log("  FAIL  formula not neutralised inside a document");
  failures += 1;
}
if (!doc.includes("\r\n")) {
  console.log("  FAIL  rows are not CRLF delimited (RFC 4180)");
  failures += 1;
}
if (failures === 0) console.log("  ok    document quoting and CRLF line endings");

console.log(
  failures === 0 ? "\nAll CSV export checks passed.\n" : `\n${failures} CSV check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
