/**
 * Single source of truth for company-level facts used across metadata,
 * structured data, the footer and the contact page.
 *
 * NOTE FOR TDR: the placeholder values below are marked `TODO(tdr)` and must be
 * replaced with the verified values captured during the Phase 1A archive before
 * production launch (spec §3, §22).
 */
export const site = {
  name: "TDR Engineering",
  legalName: "TDR Engineering",
  tagline: "Technology-driven land surveying, civil engineering, and 3D reality capture.",
  description:
    "TDR Engineering delivers land surveying, civil engineering, and 3D laser scanning with high-detail deliverables, fast turnaround, and competitive pricing.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.tdrengineering.com",
  // TODO(tdr): confirm against the legacy site archive before launch.
  phone: "(000) 000-0000",
  phoneHref: "tel:+10000000000",
  email: "info@tdrengineering.com",
  address: {
    street: "TODO(tdr): street address",
    city: "TODO(tdr): city",
    region: "CA",
    postalCode: "00000",
    country: "US",
  },
  hours: "Monday – Friday, 8:00 AM – 5:00 PM",
} as const;

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
