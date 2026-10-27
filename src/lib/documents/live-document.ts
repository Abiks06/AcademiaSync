import "server-only";
import * as Y from "yjs";
import { LiveblocksError } from "@liveblocks/node";
import { getLiveblocks, isLiveblocksConfigured } from "@/lib/liveblocks/server";
import { roomIdFor } from "@/lib/liveblocks/rooms";
import { canStore, readStoredState, writeStoredState, type Saver } from "@/lib/supabase/admin";
import { citationCounts, isBlank, manuscriptJSON, plainText, replaceManuscript, type DocJSON } from "@/lib/editor/ydoc";
import { readStyle } from "@/lib/editor/schema-version";

/** Automatic versions are at most this frequent; named ones are taken whenever asked. */
const AUTO_VERSION_GAP = "10 minutes";

/**
 * Whether the server can keep manuscripts. Pass the signed-in person's client: without the
 * secret key, the server saves as them. With no one signed in (the webhook), only the
 * secret key will do.
 */
export function isServerSavingConfigured(saver: Saver = null) {
  return canStore(saver) && isLiveblocksConfigured();
}

const toHex = (bytes: Uint8Array) => `\\x${Buffer.from(bytes).toString("hex")}`;
const fromHex = (hex: string) => new Uint8Array(Buffer.from(hex.replace(/^\\x/, ""), "hex"));

async function readRoom(documentId: string) {
  const doc = new Y.Doc();
  const update = await getLiveblocks().getYjsDocumentAsBinaryUpdate(roomIdFor(documentId));
  Y.applyUpdate(doc, new Uint8Array(update));
  return doc;
}

async function storedState(documentId: string, saver: Saver) {
  const hex = await readStoredState(documentId, saver);
  return hex ? fromHex(hex) : null;
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
export async function saveLiveDocument(documentId: string, saver: Saver, version?: VersionRequest) {
  const doc = await readRoom(documentId);
  if (isBlank(doc)) {
    const stored = await storedState(documentId, saver);
    if (stored) {
      await getLiveblocks().sendYjsBinaryUpdate(roomIdFor(documentId), stored);
      return null;
    }
  }

  const json = manuscriptJSON(doc);
  const { data, error } = await writeStoredState({
    p_document: documentId,
    p_ydoc: toHex(Y.encodeStateAsUpdate(doc)),
    p_plain_text: plainText(json).slice(0, 2_000_000),
    p_citations: [...citationCounts(json)].map(([sourceId, count]) => ({ sourceId, count })),
    p_version_content: version ? json : null,
    p_label: version?.label ?? null,
    p_created_by: version?.createdBy ?? null,
    p_min_gap: version?.auto ? AUTO_VERSION_GAP : null,
  }, saver);
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
export async function restoreLostRoom(documentId: string, saver: Saver) {
  if (!isServerSavingConfigured(saver)) return;
  try {
    const exists = await getLiveblocks()
      .getRoom(roomIdFor(documentId))
      .then(() => true)
      .catch((error: unknown) => {
        if (error instanceof LiveblocksError && error.status === 404) return false;
        throw error;
      });
    if (exists) return;
    const stored = await storedState(documentId, saver);
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
export async function restoreVersion(documentId: string, saver: Saver, content: DocJSON, restoredBy: string, label: string) {
  await saveLiveDocument(documentId, saver, { label, createdBy: restoredBy });
  const doc = await readRoom(documentId);
  const before = Y.encodeStateVector(doc);
  replaceManuscript(doc, content);
  await getLiveblocks().sendYjsBinaryUpdate(roomIdFor(documentId), Y.encodeStateAsUpdate(doc, before));
  await saveLiveDocument(documentId, saver);
}

/**
 * The manuscript as it is now, for export: from the live room, or from Supabase's copy if
 * Liveblocks can't be reached. Includes the document's citation style.
 */
export async function readManuscript(documentId: string, saver: Saver) {
  let doc: Y.Doc | null = null;
  if (isLiveblocksConfigured()) doc = await readRoom(documentId).catch(() => null);
  if ((!doc || isBlank(doc)) && canStore(saver)) {
    const stored = await storedState(documentId, saver);
    if (stored) {
      doc = new Y.Doc();
      Y.applyUpdate(doc, stored);
    }
  }
  if (!doc) return null;
  return { json: manuscriptJSON(doc), style: readStyle(doc) };
}
