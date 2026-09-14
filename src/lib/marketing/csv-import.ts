/**
 * Reading a prospect spreadsheet.
 *
 * Prospect lists arrive as CSV exports from trade show organisers, association
 * directories and whatever somebody had in Excel. They are messy in ways that
 * matter: quoted fields containing commas ("Smith, Jones & Co"), embedded
 * newlines in an address column, a UTF-8 BOM from Excel, CRLF line endings,
 * and headers spelled six different ways.
 *
 * A naive `split(",")` handles none of that, and the failure is silent — the
 * list just quietly contains wrong data. So this is a real parser, and it is
 * covered by `npm run check:import` in CI.
 *
 * `src/lib/csv.ts` is the other half of this pair: it WRITES CSV safely
 * (quoting and formula neutralisation). This one reads it.
 */

export type ParsedRow = Record<string, string>;

/**
 * RFC 4180 parsing, plus the two deviations real files always have:
 * a BOM, and bare LF line endings.
 */
export function parseCsv(input: string): string[][] {
  // Excel writes a BOM. Left in place it becomes part of the first header,
  // so "email" silently stops matching.
  const text = input.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // "" inside a quoted field is a literal quote.
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // CRLF or a lone CR, both treated as a row break.
      if (text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // A file that does not end in a newline still has a final row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty — trailing blank lines are universal.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Header matching.
 *
 * Nobody exports a file with the headers this system would have chosen, and
 * asking somebody to rename columns before importing is how an import never
 * happens. So a generous set of aliases is recognised, normalised by stripping
 * everything that is not a letter.
 */
const HEADER_ALIASES: Record<string, readonly string[]> = {
  email: ["email", "emailaddress", "email1", "primaryemail", "workemail", "e", "mail"],
  firstName: ["firstname", "first", "fname", "givenname", "forename"],
  lastName: ["lastname", "last", "lname", "surname", "familyname"],
  fullName: ["name", "fullname", "contactname", "contact", "displayname"],
  company: ["company", "companyname", "organization", "organisation", "org", "firm", "business", "account"],
  title: ["title", "jobtitle", "position", "role"],
  phone: ["phone", "phonenumber", "telephone", "tel", "mobile", "cell", "workphone", "businessphone"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z]/g, "");
}

export type ColumnMap = {
  email: number | null;
  firstName: number | null;
  lastName: number | null;
  fullName: number | null;
  company: number | null;
  title: number | null;
  phone: number | null;
};

export function mapColumns(headers: string[]): ColumnMap {
  const normalized = headers.map(normalizeHeader);
  const find = (key: keyof typeof HEADER_ALIASES): number | null => {
    for (const alias of HEADER_ALIASES[key]) {
      const index = normalized.indexOf(alias);
      if (index !== -1) return index;
    }
    return null;
  };

  return {
    email: find("email"),
    firstName: find("firstName"),
    lastName: find("lastName"),
    fullName: find("fullName"),
    company: find("company"),
    title: find("title"),
    phone: find("phone"),
  };
}

export type ImportCandidate = {
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  title: string | null;
  phone: string | null;
};

export type ImportPreview = {
  candidates: ImportCandidate[];
  /** Rows with no usable email address. Counted, never guessed at. */
  skippedNoEmail: number;
  /** Rows whose email appeared earlier in the same file. */
  duplicatesInFile: number;
  columns: ColumnMap;
  headers: string[];
};

/**
 * Deliberately conservative. An address that does not look like an address is
 * skipped rather than cleaned up: a prospect list with invented data in it is
 * worse than a shorter one, and a bounce costs sender reputation.
 */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 6 || trimmed.length > 320) return false;
  if (/\s/.test(trimmed)) return false;
  return /^[^@,;]+@[^@,;.]+(\.[^@,;.]+)+$/.test(trimmed);
}

/** Splits "Dan Archer" or "Archer, Dan" into parts. */
function splitFullName(value: string): { firstName: string; lastName: string } {
  const trimmed = value.trim();
  if (!trimmed) return { firstName: "", lastName: "" };

  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",", 2);
    return { firstName: (first ?? "").trim(), lastName: (last ?? "").trim() };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

export function buildImportPreview(csv: string): ImportPreview {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return {
      candidates: [],
      skippedNoEmail: 0,
      duplicatesInFile: 0,
      columns: {
        email: null, firstName: null, lastName: null,
        fullName: null, company: null, title: null, phone: null,
      },
      headers: [],
    };
  }

  const headers = rows[0].map((h) => h.trim());
  const columns = mapColumns(headers);
  const body = rows.slice(1);

  const candidates: ImportCandidate[] = [];
  const seen = new Set<string>();
  let skippedNoEmail = 0;
  let duplicatesInFile = 0;

  const cell = (row: string[], index: number | null): string =>
    index === null ? "" : (row[index] ?? "").trim();

  for (const row of body) {
    const rawEmail = cell(row, columns.email);
    if (!looksLikeEmail(rawEmail)) {
      skippedNoEmail += 1;
      continue;
    }

    const email = rawEmail.toLowerCase();
    if (seen.has(email)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(email);

    let firstName = cell(row, columns.firstName);
    let lastName = cell(row, columns.lastName);

    if (!firstName && !lastName) {
      const split = splitFullName(cell(row, columns.fullName));
      firstName = split.firstName;
      lastName = split.lastName;
    }

    // `contacts.first_name` and `last_name` are NOT NULL. Falling back to the
    // local part of the address keeps the row importable rather than silently
    // dropping somebody whose name column was blank.
    if (!firstName && !lastName) {
      firstName = email.split("@")[0];
    }

    candidates.push({
      email,
      firstName: firstName.slice(0, 100),
      lastName: lastName.slice(0, 100),
      company: cell(row, columns.company).slice(0, 200) || null,
      title: cell(row, columns.title).slice(0, 200) || null,
      phone: cell(row, columns.phone).slice(0, 50) || null,
    });
  }

  return { candidates, skippedNoEmail, duplicatesInFile, columns, headers };
}
