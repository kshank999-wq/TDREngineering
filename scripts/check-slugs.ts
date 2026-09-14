/**
 * Contract checks for marketing share-link slugs.
 *
 * A slug is part of a URL that gets pasted into emails and printed on things,
 * and two properties matter:
 *
 *   * It must satisfy the database's own check constraint. If `slugify` can
 *     produce something the constraint rejects, creating an asset fails with a
 *     database error instead of a sentence — and it would only happen for
 *     titles nobody thought to try.
 *   * `uniqueSlug` must terminate. Truncating a long root to make room for a
 *     "-2" suffix is exactly where a naive implementation loops forever or
 *     returns a duplicate.
 *
 * The regex below is a COPY of the one in 0011_marketing.sql, on purpose: this
 * checks agreement between two independently written rules, which is the whole
 * point. Change one and this fails.
 */

import { slugify, isValidSlug, uniqueSlug } from "../src/lib/marketing/slug";
import { normalizeTags } from "../src/content/marketing";

// marketing_assets_slug_shape, verbatim from the migration.
const DB_CONSTRAINT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  →  ${detail}` : ""}`);
  }
}

console.log("\nmarketing slug contract checks\n");

// ----------------------------------------------------------- basic shape ---
const cases: Array<[string, string]> = [
  ["Boundary survey flyer", "boundary-survey-flyer"],
  ["ALTA / NSPS Land Title Survey", "alta-nsps-land-title-survey"],
  ["2026 Rate Sheet", "2026-rate-sheet"],
  ["  Leading and trailing  ", "leading-and-trailing"],
  ["Multiple   spaces", "multiple-spaces"],
  ["Hyphen-already-there", "hyphen-already-there"],
  ["Em — dash & ampersand", "em-dash-ampersand"],
  ["Parentheses (2026)", "parentheses-2026"],
  ["under_scores_here", "under-scores-here"],
  ["Dots.in.the.name", "dots-in-the-name"],
  ["Trailing punctuation!!!", "trailing-punctuation"],
  ["---leading hyphens", "leading-hyphens"],
  ["Topografía", "topografia"],
  ["café brochure", "cafe-brochure"],
];

for (const [input, expected] of cases) {
  check(`"${input}" → ${expected}`, slugify(input) === expected, slugify(input));
}

// ------------------------------------------------- agreement with the DB ---
// Anything slugify produces must pass the database's constraint, or saving
// fails with a raw error. Includes deliberately hostile titles.
const hostile = [
  "Boundary survey flyer",
  "!!!",
  "   ",
  "---",
  "a",
  "9",
  "A".repeat(300),
  "word ".repeat(100),
  "ALTA/NSPS — 2026 (final) v2.1",
  "🏗️ Survey flyer 🏗️",
  "  --  mixed  --  ",
  "-".repeat(80) + "end",
  "x" + "-y".repeat(200),
];

for (const title of hostile) {
  const slug = slugify(title);
  const label = title.length > 24 ? `${title.slice(0, 24)}…` : title;
  if (slug === "") {
    // Empty is a legitimate answer for a title with nothing usable in it; the
    // caller refuses rather than inventing a name.
    check(`"${label}" yields no slug rather than an invalid one`, true);
  } else {
    check(
      `"${label}" satisfies the database constraint`,
      DB_CONSTRAINT.test(slug) && isValidSlug(slug),
      slug,
    );
  }
}

check("a title with no letters or digits yields nothing", slugify("!!! ??? ---") === "");
check("an empty title yields nothing", slugify("") === "");
check("a very long title is truncated", slugify("word ".repeat(100)).length <= 60);
check(
  "truncation never leaves a trailing hyphen",
  !slugify("word ".repeat(100)).endsWith("-"),
  slugify("word ".repeat(100)),
);

// --------------------------------------------------------- uniqueness -----
async function main() {
  const free = async () => false;
  check("an unused slug is returned as-is", (await uniqueSlug("Boundary flyer", free)) === "boundary-flyer");

  const taken = new Set(["boundary-flyer", "boundary-flyer-2", "boundary-flyer-3"]);
  const next = await uniqueSlug("Boundary flyer", async (c) => taken.has(c));
  check("a taken slug gets the next free suffix", next === "boundary-flyer-4", String(next));

  // The case that breaks a naive implementation: a root already at the length
  // limit. Truncating the SUFFIX instead of the root loops forever.
  const longTitle = "a".repeat(80);
  const longRoot = slugify(longTitle);
  check("a long root is already at the limit", longRoot.length === 60);

  const seen = new Set<string>();
  let allValid = true;
  let allDistinct = true;
  for (let i = 0; i < 12; i += 1) {
    const candidate = await uniqueSlug(longTitle, async (c) => seen.has(c));
    if (candidate === null) {
      allDistinct = false;
      break;
    }
    if (!DB_CONSTRAINT.test(candidate) || candidate.length > 60) allValid = false;
    if (seen.has(candidate)) allDistinct = false;
    seen.add(candidate);
  }
  check("suffixed long slugs stay within the limit and valid", allValid);
  check("suffixed long slugs are all distinct", allDistinct && seen.size === 12);

  const exhausted = await uniqueSlug("Taken", async () => true, 5);
  check("giving up returns null rather than looping", exhausted === null);

  check("a title with nothing usable returns null", (await uniqueSlug("!!!", free)) === null);

  // ------------------------------------------------------------- tags -----
  check(
    "tags are lower-cased, trimmed and de-duplicated",
    JSON.stringify(normalizeTags("ALTA, alta , Residential,alta")) ===
      JSON.stringify(["alta", "residential"]),
    JSON.stringify(normalizeTags("ALTA, alta , Residential,alta")),
  );
  check("empty tag input yields none", normalizeTags("  ,  , ").length === 0);
  check("tags are capped", normalizeTags(Array.from({ length: 50 }, (_, i) => `t${i}`).join(",")).length === 20);

  console.log("");
  if (failures > 0) {
    console.log(`${failures} slug check(s) FAILED.\n`);
    process.exit(1);
  }
  console.log("All marketing slug checks passed.\n");
}

void main();
