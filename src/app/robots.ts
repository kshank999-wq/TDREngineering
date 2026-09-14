import type { MetadataRoute } from "next";
import { site } from "@/content/site";

/**
 * robots.txt (spec §14). The internal proposal view is never indexed.
 *
 * `/proposal/` and `/portal/` are here because both are reached with a
 * credential — a signing token in the URL, or a client login. The signing page
 * also sends `noindex` itself, which is the stronger guarantee since a
 * misbehaving crawler ignores this file; this stops a well-behaved one from
 * fetching the URL at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/portal", "/portal/", "/proposal/"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
