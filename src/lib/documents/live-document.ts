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
  const stored = await readStoredState(documentId, saver);
  return stored ? { update: fromHex(stored.ydoc), revision: stored.revision } : null;
}

/** True when `doc` already has every change in `update`'s state vector. */
function covers(doc: Y.Doc, update: Uint8Array) {
  const have = Y.decodeStateVector(Y.encodeStateVector(doc));
  for (const [client, clock] of Y.decodeStateVector(Y.encodeStateVectorFromUpdate(update))) {
    if ((have.get(client) ?? 0) < clock) return false;
  }
  return true;
}

type VersionRequest = { label?: string | null; createdBy?: string | null; auto?: boolean };

const isConflict = (error: { code?: string } | null) => error?.code === "40001";

/**
 * One save: the live room merged with what Supabase already holds, so the saved copy only
 * ever gains changes. Whatever Supabase has that the room lacks (a lost or reset room) is
 * pushed back into the room first. Returns the merged document and the new version's id.
 */
async function saveOnce(documentId: string, saver: Saver, version: VersionRequest | undefined, room: Y.Doc) {
  const stored = await storedState(documentId, saver);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(room));
  if (stored) {
    if (!covers(room, stored.update)) {
      await getLiveblocks().sendYjsBinaryUpdate(roomIdFor(documentId), Y.diffUpdate(stored.update, Y.encodeStateVector(room)));
    }
    Y.applyUpdate(doc, stored.update);
  } else if (isBlank(doc)) {
    return { doc, versionId: null, error: null };
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
    p_base_revision: stored?.revision ?? null,
  }, saver);
  return { doc, versionId: data ?? null, error };
}

async function save(documentId: string, saver: Saver, version?: VersionRequest, room?: Y.Doc) {
  for (let attempt = 0; ; attempt++) {
    const result = await saveOnce(documentId, saver, version, room ?? (await readRoom(documentId)));
    // Someone else saved in between: merge with theirs and try again.
    if (isConflict(result.error) && attempt < 3) {
      room = undefined;
      continue;
    }
    // The document was deleted while its room lived on; there is nothing to keep.
    if (result.error?.code === "23503") return { doc: result.doc, versionId: null };
    if (result.error) throw new Error(`Couldn't save the manuscript: ${result.error.message}`);
    return { doc: result.doc, versionId: result.versionId };
  }
}

/**
 * Copies the live manuscript from Liveblocks into Supabase: the Yjs document itself, its
 * plain text, which sources it cites and, if asked, a version for history. Returns the new
 * version's id, or null when none was needed.
 *
 * Saves merge rather than replace, so two saves racing, or an empty room (a new Liveblocks
 * project or key), can never make the saved copy lose text; the room is refilled instead.
 */
export async function saveLiveDocument(documentId: string, saver: Saver, version?: VersionRequest) {
  return (await save(documentId, saver, version)).versionId;
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
    await getLiveblocks().sendYjsBinaryUpdate(roomIdFor(documentId), stored.update);
  } catch (error) {
    console.error("[live-document] couldn't check the room", documentId, error);
  }
}

/**
 * Replaces the live manuscript with a version, as one change everyone's editor applies
 * together. The text as it is at that moment is saved as a version first, from the very
 * snapshot that is then replaced, so a restore can always be undone.
 */
export async function restoreVersion(documentId: string, saver: Saver, content: DocJSON, restoredBy: string, label: string) {
  const { doc } = await save(documentId, saver, { label, createdBy: restoredBy });
  const before = Y.encodeStateVector(doc);
  replaceManuscript(doc, content);
  await getLiveblocks().sendYjsBinaryUpdate(roomIdFor(documentId), Y.encodeStateAsUpdate(doc, before));
  await save(documentId, saver);
}

/**
 * The manuscript as it is now, for export: from the live room, or from Supabase's copy if
 * Liveblocks can't be reached. Includes the document's citation style.
 */
export async function readManuscript(documentId: string, saver: Saver) {
  let doc: Y.Doc | null = null;
  if (isLiveblocksConfigured()) {
    // A manuscript nobody has opened yet has no room: it is simply empty.
    doc = await readRoom(documentId).catch((error: unknown) =>
      error instanceof LiveblocksError && error.status === 404 ? new Y.Doc() : null,
    );
  }
  if ((!doc || isBlank(doc)) && canStore(saver)) {
    const stored = await storedState(documentId, saver);
    if (stored) {
      doc = new Y.Doc();
      Y.applyUpdate(doc, stored.update);
    }
  }
  if (!doc) return null;
  return { json: manuscriptJSON(doc), style: readStyle(doc) };
}
