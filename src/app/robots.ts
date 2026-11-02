export const dynamic = "force-dynamic";
import type { MetadataRoute } from "next";
import { isProduction, publicBaseUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  if (!isProduction()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/checkout", "/booking", "/manage-booking", "/documents", "/api", "/demo", "/demo-gateway"] }],
    sitemap: `${publicBaseUrl()}/sitemap.xml`,
  };
}
