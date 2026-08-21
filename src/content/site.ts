/**
 * Single source of truth for company-level facts used across metadata,
 * structured data, the footer and the contact page.
 *
 * NOTE FOR TDR — how the unknowns are handled here
 * ------------------------------------------------
 * A business fact nobody has verified yet is the **empty string**, never
 * invented placeholder text and never a stand-in value. Two reasons:
 *
 *   1. Every component below omits what is unset rather than rendering it, so
 *      a premature deploy shows a contact page with no address instead of one
 *      reading "TODO(tdr): street address" — and never a phone link to a
 *      number that dials nothing.
 *   2. A plausible-looking wrong value (a 555 phone number, a guessed suite
 *      number) is far more dangerous than a blank, because it survives review.
 *      Blanks are visible; plausible fabrications are not.
 *
 * Run `npm run check:content` to list everything still unset or still assumed.
 * The launch checklist requires it to come back clean (spec §22).
 */
export const site = {
  name: "TDR Engineering",
  legalName: "TDR Engineering",
  tagline: "Technology-driven land surveying, civil engineering, and 3D reality capture.",
  description:
    "TDR Engineering delivers land surveying, civil engineering, and 3D laser scanning with high-detail deliverables, fast turnaround, and competitive pricing.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.tdrengineering.com",

  // --- Unverified: supply from the Phase 1A archive (spec §3) -------------
  /** Display form, e.g. "(626) 555-0142". */
  phone: "",
  /** Dial form, e.g. "tel:+16265550142". Must match `phone`. */
  phoneHref: "",
  /** Business hours as displayed, e.g. "Monday – Friday, 8:00 AM – 5:00 PM". */
  hours: "",
  address: {
    street: "",
    /** Second line — suite or unit. Optional; blank is a valid final answer. */
    street2: "",
    city: "",
    /** Two-letter state code. */
    region: "",
    postalCode: "",
    country: "US",
  },

  // --- Assumed, needs confirmation ---------------------------------------
  /**
   * Conventional default. It is also the EMAIL_REPLY_TO default in
   * .env.example, so if TDR uses a different public address, change both.
   */
  email: "info@tdrengineering.com",
} as const;

/** True once a mailing address is known well enough to publish. */
export const hasAddress = Boolean(site.address.street && site.address.city);

/** True once a phone number is known. Both forms must be present to publish. */
export const hasPhone = Boolean(site.phone && site.phoneHref);

/** Single-line address for structured data. Empty when the address is unset. */
export const addressLine = hasAddress
  ? [
      site.address.street,
      site.address.street2,
      `${site.address.city}, ${site.address.region} ${site.address.postalCode}`.trim(),
    ]
      .filter(Boolean)
      .join(", ")
  : "";

export const navigation = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/3d-scanning", label: "3D Scanning" },
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About TDR" },
  { href: "/questions", label: "Questions" },
  { href: "/request-a-proposal", label: "Request a Proposal" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * Homepage hero media (spec §4).
 *
 * A 10–20 second silent promotional video or motion sequence, optimized so it
 * does not materially slow page load, with a static fallback image.
 *
 * Until TDR supplies the footage, both paths are empty and the hero renders an
 * animated reality-capture graphic instead — no broken <video> element, no
 * missing-poster flash. Drop the files into /public/media and set the paths
 * here to switch the hero over; nothing else needs to change.
 *
 * Encoding guidance for the supplied footage:
 *   * H.264 MP4 + VP9/AV1 WebM, no audio track, 1920×1080, under ~4 MB.
 *   * Poster exported from the first frame as WebP or JPEG under ~200 KB.
 */
export const heroMedia = {
  videoMp4: "", // e.g. "/media/hero.mp4"
  videoWebm: "", // e.g. "/media/hero.webm"
  poster: "", // e.g. "/media/hero-poster.jpg"
  /** Shown to screen readers and used as the video's accessible description. */
  description:
    "TDR field crews operating LiDAR scanners, point clouds resolving into buildings, and survey deliverables in CAD and Revit.",
} as const;

/**
 * Rotating overlay messages for the homepage hero (spec §4).
 */
export const heroMessages = [
  "Latest Technology",
  "Fast Turnaround",
  "Competitive Pricing",
  "Exceptional Detail",
  "3D Scanning Included",
] as const;
