import { Liveblocks } from "@liveblocks/node";

export function isLiveblocksConfigured() {
  return Boolean(process.env.LIVEBLOCKS_SECRET_KEY);
}

/** Server-side Liveblocks client. The secret key never leaves the server. */
export function getLiveblocks() {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new Error("Live editing is not configured. Set LIVEBLOCKS_SECRET_KEY (see .env.example).");
  // LIVEBLOCKS_BASE_URL points at the local dev server (`npx liveblocks dev`). A production
  // build ignores it, so a stray setting can never send real rooms somewhere else.
  const baseUrl = process.env.NODE_ENV === "production" ? undefined : process.env.LIVEBLOCKS_BASE_URL || undefined;
  return new Liveblocks({ secret, baseUrl });
}
