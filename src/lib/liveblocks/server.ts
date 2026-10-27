import { Liveblocks } from "@liveblocks/node";

export function isLiveblocksConfigured() {
  return Boolean(process.env.LIVEBLOCKS_SECRET_KEY);
}

/** Server-side Liveblocks client. The secret key never leaves the server. */
export function getLiveblocks() {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new Error("Live editing is not configured. Set LIVEBLOCKS_SECRET_KEY (see .env.example).");
  // LIVEBLOCKS_BASE_URL points at the local dev server (`npx liveblocks dev`); unset in production.
  return new Liveblocks({ secret, baseUrl: process.env.LIVEBLOCKS_BASE_URL || undefined });
}
