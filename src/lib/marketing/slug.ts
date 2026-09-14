/**
 * Slugs for shareable marketing links: /m/<slug>.
 *
 * A slug is part of a URL that gets printed on things and pasted into emails,
 * so two rules matter more than prettiness:
 *
 *   1. It must match the database's own `marketing_assets_slug_shape` check
 *      (lowercase, digits, single hyphens, no leading or trailing hyphen).
 *      If this function can produce something the constraint rejects, saving
 *      fails with a database error instead of a sentence.
 *   2. It must never be silently reused. That is enforced in the database by a
 *      unique index covering archived assets too — reusing a slug would mean a
 *      link already sitting in somebody's inbox quietly starts serving a
 *      different document.
 *
 * Kept free of `server-only` so the CI check can import it directly.
 */

/** Longest slug we will generate. Room for a suffix inside the column limit. */
const MAX_SLUG_LENGTH = 60;

/**
 * Turns a title into a slug, or returns "" when nothing usable survives.
 *
 * Returning "" rather than a fallback like "asset" is deliberate: the caller
 * has to decide what to do, and a pile of assets named `asset-2`, `asset-3`
 * is worse than asking the person for a title with a letter in it.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    // Strip accents, so "Topographía" becomes "topografia" rather than losing
    // the letter entirely.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Anything that is not a letter or digit becomes a separator. Ampersands,
    // slashes and em dashes are common in marketing titles.
    .replace(/[^a-z0-9]+/g, "-")
    // Collapse runs and trim the ends — both are constraint violations.
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    // The slice can leave a trailing hyphen behind.
    .replace(/-$/, "");

  return slug;
}

/** Whether a slug satisfies the database constraint. Same regex, on purpose. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= MAX_SLUG_LENGTH;
}

/**
 * Picks a slug that is not already taken.
 *
 * `taken` is asked rather than assumed, so the caller supplies the real
 * database check. The unique index is still the authority — two people
 * creating an asset at the same moment can both pass this — so the caller must
 * handle a unique violation regardless. This exists to make the common case
 * produce a readable slug, not to guarantee uniqueness.
 */
export async function uniqueSlug(
  base: string,
  taken: (candidate: string) => Promise<boolean>,
  limit = 50,
): Promise<string | null> {
  const root = slugify(base);
  if (!root) return null;

  if (!(await taken(root))) return root;

  for (let n = 2; n <= limit; n += 1) {
    const suffix = `-${n}`;
    // Trim the root, not the suffix: truncating the number would produce
    // collisions that loop forever.
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-$/, "")}${suffix}`;
    if (!(await taken(candidate))) return candidate;
  }
  return null;
}
