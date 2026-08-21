/**
 * Content readiness check (spec §22 definition-of-done item 3).
 *
 *   npm run check:content            report only, always exits 0
 *   npm run check:content -- --strict  exits 1 if anything is unresolved
 *
 * Why this exists: the site is built so that an unverified business fact is
 * simply omitted rather than rendered (see src/content/site.ts). That makes a
 * premature deploy safe — but it also makes the gap silent. This is what makes
 * it loud again, so nothing reaches production quietly missing a phone number.
 *
 * CI runs the report form, so main stays green while every run prints the list.
 * The launch checklist runs `--strict`, which must pass before cutover.
 *
 * IMPORTANT: nothing here invents a value. It reports; a human supplies.
 */

import { site, hasAddress, hasPhone, heroMedia } from "../src/content/site";
import { projects } from "../src/content/projects";
import { legacyRedirects } from "../src/content/redirects";

type Severity = "blocking" | "confirm";

type Finding = {
  severity: Severity;
  what: string;
  where: string;
  detail: string;
};

const findings: Finding[] = [];

const need = (condition: boolean, finding: Finding) => {
  if (!condition) findings.push(finding);
};

// --- Business facts (spec §3: captured during the Phase 1A archive) --------

need(hasPhone, {
  severity: "blocking",
  what: "Phone number",
  where: "src/content/site.ts → site.phone / site.phoneHref",
  detail:
    "Header, footer, homepage, about and proposal pages all omit the phone link until both forms are set.",
});

need(hasAddress, {
  severity: "blocking",
  what: "Mailing address",
  where: "src/content/site.ts → site.address",
  detail:
    "Footer and contact page omit the office block; the address is also withheld from structured data.",
});

need(Boolean(site.hours), {
  severity: "blocking",
  what: "Business hours",
  where: "src/content/site.ts → site.hours",
  detail: "Omitted from the contact, about, homepage and proposal pages until set.",
});

// site.email always has a value, so there is nothing to flag as blocking — but
// an assumed-but-plausible default is the dangerous kind of gap precisely
// because it renders fine and survives review. It gets confirmed explicitly.
findings.push({
  severity: "confirm",
  what: "Public email address is an assumed default",
  where: "src/content/site.ts → site.email",
  detail: `Currently "${site.email}". Confirm this is the address TDR wants published, and keep EMAIL_REPLY_TO in the Vercel environment in step with it.`,
});

// --- Media (spec §4) -------------------------------------------------------

need(Boolean(heroMedia.videoMp4 || heroMedia.videoWebm), {
  severity: "blocking",
  what: "Homepage hero video",
  where: "src/content/site.ts → heroMedia",
  detail:
    "The hero falls back to an animated SVG, which is presentable but is not the promotional sequence the spec asks for (10–20s, silent, with a static poster).",
});

need(Boolean(heroMedia.poster), {
  severity: "blocking",
  what: "Hero poster image",
  where: "src/content/site.ts → heroMedia.poster",
  detail: "Required as the static fallback for the hero video.",
});

// --- Marketing content (spec §4: TDR must approve all public claims) -------

const placeholderProjects = projects.filter((p) => p.slug.startsWith("example-"));
need(placeholderProjects.length === 0, {
  severity: "blocking",
  what: `Project examples are placeholders (${placeholderProjects.length})`,
  where: "src/content/projects.ts",
  detail: `Still structural: ${placeholderProjects.map((p) => p.slug).join(", ")}. Replace with real projects, and confirm every client name is cleared for public use.`,
});

// --- SEO (spec §14) --------------------------------------------------------

// The seeded entries are conventional aliases that are safe whether or not the
// legacy site used them. Real coverage only starts once the crawl has run.
const SEEDED_ALIAS_COUNT = 14;
need(legacyRedirects.length > SEEDED_ALIAS_COUNT, {
  severity: "blocking",
  what: "Legacy redirect map not populated from the archive",
  where: "src/content/redirects.ts",
  detail: `Only the ${legacyRedirects.length} seeded conventional aliases are present. Run \`npm run archive:crawl\`, complete inventory.csv, then add every indexed legacy URL that needs to keep its search equity.`,
});

// --- Report ----------------------------------------------------------------

const strict = process.argv.includes("--strict");
const blocking = findings.filter((f) => f.severity === "blocking");
const confirm = findings.filter((f) => f.severity === "confirm");

const section = (title: string, items: Finding[]) => {
  if (items.length === 0) return;
  console.log(`\n${title}\n${"─".repeat(title.length)}`);
  for (const item of items) {
    console.log(`\n  ${item.what}`);
    console.log(`    where : ${item.where}`);
    console.log(`    why   : ${item.detail}`);
  }
};

console.log("TDR Engineering — content readiness (spec §22)");

section(`BLOCKING — must be resolved before launch (${blocking.length})`, blocking);
section(`CONFIRM — assumed defaults, verify before launch (${confirm.length})`, confirm);

if (blocking.length === 0 && confirm.length === 0) {
  console.log("\n✓ All content placeholders resolved.");
  process.exit(0);
}

console.log(
  `\n${blocking.length} blocking, ${confirm.length} to confirm.` +
    `\nNothing here is invented by this script — each value must come from TDR.` +
    `\nSee docs/CONTENT-REQUIRED.md for exactly what to supply.`,
);

if (strict && blocking.length > 0) {
  console.error(`\n✗ ${blocking.length} blocking item(s) unresolved — not ready to launch.`);
  process.exit(1);
}

process.exit(0);
