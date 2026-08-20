import type { MetadataRoute } from "next";
import { site } from "@/content/site";
import { pageServices } from "@/content/services";

/** XML sitemap (spec §14 required web basics). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/services", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/3d-scanning", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/projects", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/about", priority: 0.6, changeFrequency: "yearly" as const },
    { path: "/questions", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/request-a-proposal", priority: 0.9, changeFrequency: "yearly" as const },
    { path: "/contact", priority: 0.7, changeFrequency: "yearly" as const },
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${site.url}${route.path}`,
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...pageServices.map((service) => ({
      url: `${site.url}/services/${service.code}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
