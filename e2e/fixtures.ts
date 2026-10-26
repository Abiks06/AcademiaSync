import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";

export const e2eConfigured = Boolean(
  process.env.E2E_BASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY,
);

export function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A confirmed test user, signed in through the same cookies the app's own sign-in sets. */
export async function signedInUser(db: SupabaseClient, context: BrowserContext, name: string) {
  const email = `e2e-${name}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: `E2E ${name}` } });
  if (created.error) throw created.error;
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;

  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.push({ name, value })),
    },
  });
  const verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (verified.error) throw verified.error;

  const url = new URL(process.env.E2E_BASE_URL!);
  await context.addCookies(jar.map((c) => ({ ...c, domain: url.hostname, path: "/", secure: url.protocol === "https:", sameSite: "Lax" as const })));
  return created.data.user;
}
