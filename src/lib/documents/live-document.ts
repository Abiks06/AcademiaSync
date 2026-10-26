import "server-only";
import * as Y from "yjs";
import { LiveblocksError } from "@liveblocks/node";
import { getLiveblocks, isLiveblocksConfigured } from "@/lib/liveblocks/server";
import { roomIdFor } from "@/lib/liveblocks/rooms";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { citationCounts, isBlank, manuscriptJSON, plainText, replaceManuscript, type DocJSON } from "@/lib/editor/ydoc";

/** Automatic versions are at most this frequent; named ones are taken whenever asked. */
const AUTO_VERSION_GAP = "10 minutes";

export function isServerSavingConfigured() {
  return isAdminConfigured() && isLiveblocksConfigured();
}

const toHex = (bytes: Uint8Array) => `\\x${Buffer.from(bytes).toString("hex")}`;
const fromHex = (hex: string) => new Uint8Array(Buffer.from(hex.replace(/^\\x/, ""), "hex"));

async function readRoom(documentId: string) {
  const doc = new Y.Doc();
  const update = await getLiveblocks().getYjsDocumentAsBinaryUpdate(roomIdFor(documentId));
  Y.applyUpdate(doc, new Uint8Array(update));
  return doc;
}

async function storedState(documentId: string) {
  const { data, error } = await adminClient().from("document_state").select("ydoc").eq("document_id", documentId).maybeSingle();
  if (error) throw new Error(`Couldn't read the saved manuscript: ${error.message}`);
  return data ? fromHex(data.ydoc) : null;
}

type VersionRequest = { label?: string | null; createdBy?: string | null; auto?: boolean };

/**
 * Copies the live manuscript from Liveblocks into Supabase: the Yjs document itself, its
 * plain text, which sources it cites and, if asked, a version for history. Returns the new
 * version's id, or null when none was needed.
 *
 * A room that has never been written to while Supabase holds text means the room was lost
 * (a new Liveblocks project or key). Then the saved text is put back instead of being
 * overwritten with nothing.
 */
export async function saveLiveDocument(documentId: string, version?: VersionRequest) {
  const doc = await readRoom(documentId);
  if (isBlank(doc)) {
    const stored = await storedState(documentId);
    if (stored) {
      await getLiveblocks().sendYjsBinaryUpdate(roomIdFor(documentId), stored);
      return null;
    }
  }

  const json = manuscriptJSON(doc);
  const { data, error } = await adminClient().rpc("save_document_state", {
    p_document: documentId,
    p_ydoc: toHex(Y.encodeStateAsUpdate(doc)),
    p_plain_text: plainText(json).slice(0, 2_000_000),
    p_citations: [...citationCounts(json)].map(([sourceId, count]) => ({ sourceId, count })),
    p_version_content: version ? json : null,
    p_label: version?.label ?? null,
    p_created_by: version?.createdBy ?? null,
    p_min_gap: version?.auto ? AUTO_VERSION_GAP : null,
  });
  // The document was deleted while its room lived on; there is nothing to keep.
  if (error?.code === "23503") return null;
  if (error) throw new Error(`Couldn't save the manuscript: ${error.message}`);
  return data;
}

/**
 * Puts the saved text back into a room that no longer exists at Liveblocks (a new project
 * or key, say), before anyone connects and starts typing into an empty document. Checks
 * only that the room exists, so it is cheap enough to run before every token. Never
 * throws: opening the editor matters more.
 */
export async function restoreLostRoom(documentId: string) {
  if (!isServerSavingConfigured()) return;
  try {
    const saved = await adminClient().from("document_state").select("document_id").eq("document_id", documentId).maybeSingle();
    if (!saved.data) return;
    const exists = await getLiveblocks()
      .getRoom(roomIdFor(documentId))
      .then(() => true)
      .catch((error: unknown) => {
        if (error instanceof LiveblocksError && error.status === 404) return false;
        throw error;
      });
    if (exists) return;
    const stored = await storedState(documentId);
    if (!stored) return;
    await getLiveblocks().createRoom(roomIdFor(documentId), { defaultAccesses: [] });
    await getLiveblocks().sendYjsBinaryUpdate(roomIdFor(documentId), stored);
  } catch (error) {
    console.error("[live-document] couldn't check the room", documentId, error);
  }
}

/**
 * Replaces the live manuscript with a version, as one change everyone's editor applies
 * together. The current text is saved as a version first, so a restore can be undone.
 */
export async function restoreVersion(documentId: string, content: DocJSON, restoredBy: string, label: string) {
  await saveLiveDocument(documentId, { label, createdBy: restoredBy });
  const doc = await readRoom(documentId);
  const before = Y.encodeStateVector(doc);
  replaceManuscript(doc, content);
  await getLiveblocks().sendYjsBinaryUpdate(roomIdFor(documentId), Y.encodeStateAsUpdate(doc, before));
  await saveLiveDocument(documentId);
}
