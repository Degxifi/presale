import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;
  const routes = [
    "",
    "/how-it-works",
    "/tokenomics",
    "/faq",
    "/quests",
  ];
  return routes.map((route) => ({
    url: `${base}${route}`,
    changeFrequency: "daily",
    priority: route === "" ? 1 : 0.7,
  }));
}
