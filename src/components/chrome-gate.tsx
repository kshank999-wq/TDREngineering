"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the public marketing chrome on internal routes.
 *
 * The admin area is nested inside the root layout, so without this it inherits
 * the public header and footer — which puts "Request a Proposal" as the most
 * prominent button on a screen for managing proposals, a full services and
 * contact footer under the requests table, and a "Staff login" link in front of
 * someone who is already signed in.
 *
 * A client-side gate rather than Next.js route groups: splitting the app into
 * separate root layouts would mean relocating every public route, and this
 * achieves the same result for a marketing site with one internal area.
 */
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  return <>{children}</>;
}
