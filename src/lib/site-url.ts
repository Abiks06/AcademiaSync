import "server-only";
import { headers } from "next/headers";

/** The app's public origin, for links in emails. A fixed NEXT_PUBLIC_SITE_URL is safest in production. */
export async function siteOrigin() {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? (h.get("host")?.startsWith("localhost") ? "http" : "https");
  return h.get("origin") ?? `${proto}://${h.get("host")}`;
}
