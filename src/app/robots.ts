import type { MetadataRoute } from "next";
import { site } from "@/content/site";

/** robots.txt (spec §14). The internal proposal view is never indexed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
