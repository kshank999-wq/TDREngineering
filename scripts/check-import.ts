/**
 * Contract checks for prospect CSV import.
 *
 * Import failures are silent. A parser that mishandles a quoted field does not
 * crash — it puts half an address in the name column and carries on, and
 * nobody notices until a mailing goes out addressed to `"Smith`. The cases
 * below are the ones real spreadsheets actually contain.
 *
 * The pair to this is `check:csv`, which covers WRITING CSV safely. This
 * covers reading it.
 */

import {
  parseCsv,
  mapColumns,
  buildImportPreview,
  looksLikeEmail,
} from "../src/lib/marketing/csv-import";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  →  ${detail}` : ""}`);
  }
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("\nprospect import contract checks\n");

// ------------------------------------------------------------- parsing ----
check("a plain row parses", eq(parseCsv("a,b,c"), [["a", "b", "c"]]));

check(
  "CRLF line endings",
  eq(parseCsv("a,b\r\nc,d"), [["a", "b"], ["c", "d"]]),
  JSON.stringify(parseCsv("a,b\r\nc,d")),
);

check("bare LF line endings", eq(parseCsv("a,b\nc,d"), [["a", "b"], ["c", "d"]]));

check(
  "a quoted field containing a comma",
  eq(parseCsv('name,email\n"Smith, Jones & Co",x@y.com'), [
    ["name", "email"],
    ["Smith, Jones & Co", "x@y.com"],
  ]),
  JSON.stringify(parseCsv('name,email\n"Smith, Jones & Co",x@y.com')),
);

check(
  "an escaped quote inside a quoted field",
  eq(parseCsv('a\n"He said ""hi"""'), [["a"], ['He said "hi"']]),
  JSON.stringify(parseCsv('a\n"He said ""hi"""')),
);

check(
  "a newline inside a quoted field does not break the row",
  eq(parseCsv('addr,email\n"12 Oak Lane\nReno NV",x@y.com'), [
    ["addr", "email"],
    ["12 Oak Lane\nReno NV", "x@y.com"],
  ]),
  JSON.stringify(parseCsv('addr,email\n"12 Oak Lane\nReno NV",x@y.com')),
);

check("an empty field is preserved", eq(parseCsv("a,,c"), [["a", "", "c"]]));
check("a trailing empty field is preserved", eq(parseCsv("a,b,"), [["a", "b", ""]]));
check("a file with no trailing newline keeps its last row",
  eq(parseCsv("a,b\nc,d"), [["a", "b"], ["c", "d"]]));
check("trailing blank lines are dropped",
  eq(parseCsv("a,b\nc,d\n\n\n"), [["a", "b"], ["c", "d"]]));
check("an empty file yields no rows", eq(parseCsv(""), []));

// Excel's BOM, which silently breaks header matching if it survives.
const bom = "﻿email,name\nx@y.com,Dan";
check("a UTF-8 BOM is stripped", parseCsv(bom)[0][0] === "email", parseCsv(bom)[0][0]);
check(
  "a BOM does not break header mapping",
  mapColumns(parseCsv(bom)[0]).email === 0,
);

// ------------------------------------------------------------- headers ----
const headerCases: Array<[string[], string]> = [
  [["Email Address", "First Name", "Last Name"], "spaced and capitalised"],
  [["EMAIL", "FIRSTNAME", "LASTNAME"], "upper case"],
  [["e-mail", "first_name", "last_name"], "punctuated"],
  [["Primary Email", "Given Name", "Surname"], "alternative wording"],
];
for (const [headers, label] of headerCases) {
  const cols = mapColumns(headers);
  check(`headers: ${label}`, cols.email === 0 && cols.firstName === 1 && cols.lastName === 2,
    JSON.stringify(cols));
}

const orgCols = mapColumns(["Organization", "Job Title", "Work Phone", "E-Mail"]);
check(
  "company, title, phone and email are found in any order",
  orgCols.company === 0 && orgCols.title === 1 && orgCols.phone === 2 && orgCols.email === 3,
  JSON.stringify(orgCols),
);

check("a file with no email column maps email to null", mapColumns(["a", "b"]).email === null);

// ------------------------------------------------------------- emails ----
const valid = ["a@b.co", "dan.archer@dansarch.com", "x+tag@sub.domain.org"];
const invalid = [
  "", "notanemail", "@nodomain.com", "no@tld", "two@@at.com",
  "spaces in@email.com", "trailing@dot.", "a@b", "a,b@c.com", "a@b;c.com",
];
for (const e of valid) check(`"${e}" is accepted`, looksLikeEmail(e));
for (const e of invalid) check(`"${e}" is rejected`, !looksLikeEmail(e), e);

// ------------------------------------------------------------ preview ----
const messy = [
  "Email Address,Full Name,Organization,Job Title",
  'dan@dansarch.test,"Archer, Dan","Dans Arch, Inc.",Principal',
  "pat@dansarch.test,Pat Brown,Dans Arch,Associate",
  "DAN@DANSARCH.TEST,Dan Again,Dans Arch,Principal",
  "not-an-email,Broken Row,Nowhere,",
  ",Missing Email,Nowhere,",
  "solo@example.test,Cher,,",
].join("\r\n");

const preview = buildImportPreview(messy);

check("valid rows are kept", preview.candidates.length === 3, String(preview.candidates.length));
check("rows with no usable email are counted", preview.skippedNoEmail === 2,
  String(preview.skippedNoEmail));
check("a repeated address in the same file is counted once", preview.duplicatesInFile === 1,
  String(preview.duplicatesInFile));

const dan = preview.candidates[0];
check('"Archer, Dan" splits to first and last', dan.firstName === "Dan" && dan.lastName === "Archer",
  `${dan.firstName} / ${dan.lastName}`);
check("a quoted company keeps its comma", dan.company === "Dans Arch, Inc.", String(dan.company));
check("the title is read", dan.title === "Principal", String(dan.title));

const pat = preview.candidates[1];
check('"Pat Brown" splits to first and last', pat.firstName === "Pat" && pat.lastName === "Brown");

const solo = preview.candidates[2];
check("a single-word name becomes the first name", solo.firstName === "Cher" && solo.lastName === "");
check("an absent company is null", solo.company === null);

check(
  "addresses are lower-cased so duplicates collapse",
  preview.candidates.every((c) => c.email === c.email.toLowerCase()),
);

// The NOT NULL columns must always be satisfiable.
const noNames = buildImportPreview("email\nnobody@example.test");
check(
  "a row with no name at all still yields a usable first name",
  noNames.candidates[0]?.firstName === "nobody",
  noNames.candidates[0]?.firstName,
);
check(
  "every candidate has a non-empty first name",
  preview.candidates.every((c) => c.firstName.length > 0),
);

// Separate first/last columns win over a combined one.
const split = buildImportPreview("email,first name,last name,name\nx@y.test,Ada,Lovelace,Ignore Me");
check(
  "explicit first/last columns take priority over a full-name column",
  split.candidates[0].firstName === "Ada" && split.candidates[0].lastName === "Lovelace",
  `${split.candidates[0].firstName} / ${split.candidates[0].lastName}`,
);

// A header-only file is a real thing people upload.
const headerOnly = buildImportPreview("email,name");
check("a header-only file yields nothing and does not throw", headerOnly.candidates.length === 0);

// A file with no email column at all: every row is skipped, nothing invented.
const noEmailColumn = buildImportPreview("name,company\nDan,Dans Arch\nPat,Dans Arch");
check(
  "a file with no email column imports nobody",
  noEmailColumn.candidates.length === 0 && noEmailColumn.skippedNoEmail === 2,
  JSON.stringify([noEmailColumn.candidates.length, noEmailColumn.skippedNoEmail]),
);

console.log("");
if (failures > 0) {
  console.log(`${failures} import check(s) FAILED.\n`);
  process.exit(1);
}
console.log("All prospect import checks passed.\n");
