import { NextResponse, type NextRequest } from "next/server";
import { WebhookHandler } from "@liveblocks/node";
import { documentIdFromRoom } from "@/lib/liveblocks/rooms";
import { isServerSavingConfigured, saveLiveDocument } from "@/lib/documents/live-document";

/**
 * Liveblocks calls this whenever a manuscript changes (at most every few seconds per room).
 * The server then copies the live text into Supabase, indexes its citations and takes an
 * automatic version when one is due. A failure answers 500, so Liveblocks retries.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.LIVEBLOCKS_WEBHOOK_SECRET;
  if (!secret || !isServerSavingConfigured()) {
    return NextResponse.json({ error: "Server-side saving isn't set up on this server." }, { status: 503 });
  }

  let event;
  try {
    event = new WebhookHandler(secret).verifyRequest({ headers: request.headers, rawBody: await request.text() });
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  if (event.type !== "ydocUpdated") return NextResponse.json({ ok: true });
  const documentId = documentIdFromRoom(event.data.roomId);
  if (!documentId) return NextResponse.json({ ok: true });

  try {
    await saveLiveDocument(documentId, null, { auto: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[liveblocks-webhook] save failed", documentId, error);
    return NextResponse.json({ error: "Save failed." }, { status: 500 });
  }
}
