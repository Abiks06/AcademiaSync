import "server-only";
import { cacheLife } from "next/cache";
import { getSupabaseEnv } from "@/lib/env";

export type Provider = "google" | "azure";

/**
 * Which sign-in providers are switched on in Supabase. Read once every few minutes, so a
 * provider turned on in the dashboard appears without a deploy. If the settings can't be
 * read, every button stays, and the click itself checks again.
 */
export async function providerSettings(): Promise<Record<Provider, boolean>> {
  "use cache";
  cacheLife("minutes");
  const { url, key } = getSupabaseEnv();
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return { google: true, azure: true };
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return { google: settings.external?.google !== false, azure: settings.external?.azure !== false };
  } catch {
    return { google: true, azure: true };
  }
}

export async function isProviderEnabled(provider: Provider) {
  const { url, key } = getSupabaseEnv();
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: "no-store" });
    if (!res.ok) return true; // Let Supabase report the real problem.
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.[provider] !== false;
  } catch {
    return true;
  }
}
