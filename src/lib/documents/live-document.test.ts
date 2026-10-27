import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { manuscriptJSON, plainText, replaceManuscript, type DocJSON } from "@/lib/editor/ydoc";

// An in-memory Liveblocks room and document_state row, standing in for both services.
const room = { doc: new Y.Doc(), exists: true };
const db: { state: { ydoc: string; revision: number } | null; saves: Record<string, unknown>[]; conflictOnce: boolean } = {
  state: null,
  saves: [],
  conflictOnce: false,
};

vi.mock("@/lib/liveblocks/server", () => ({
  isLiveblocksConfigured: () => true,
  getLiveblocks: () => ({
    getYjsDocumentAsBinaryUpdate: async () => Y.encodeStateAsUpdate(room.doc),
    sendYjsBinaryUpdate: async (_room: string, update: Uint8Array) => Y.applyUpdate(room.doc, update),
    getRoom: async () => {
      if (!room.exists) throw Object.assign(new Error("not found"), { status: 404 });
    },
    createRoom: async () => {
      room.exists = true;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  canStore: () => true,
  readStoredState: async () => db.state,
  writeStoredState: async (args: Record<string, unknown>) => {
    if (db.conflictOnce) {
      db.conflictOnce = false;
      db.state = { ydoc: db.state!.ydoc, revision: db.state!.revision + 1 };
      return { data: null, error: { code: "40001", message: "conflict" } };
    }
    if ((args.p_base_revision ?? null) !== (db.state?.revision ?? null)) return { data: null, error: { code: "40001", message: "stale" } };
    db.saves.push(args);
    db.state = { ydoc: args.p_ydoc as string, revision: (db.state?.revision ?? 0) + 1 };
    return { data: args.p_version_content ? `version-${db.saves.length}` : null, error: null };
  },
}));

const { saveLiveDocument, restoreVersion } = await import("./live-document");

const paragraph = (text: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const savedText = () => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(Buffer.from(db.state!.ydoc.replace(/^\\x/, ""), "hex")));
  return plainText(manuscriptJSON(doc)).trim();
};
const roomText = () => plainText(manuscriptJSON(room.doc)).trim();
const DOC = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  room.doc = new Y.Doc();
  room.exists = true;
  db.state = null;
  db.saves = [];
  db.conflictOnce = false;
});

describe("saveLiveDocument", () => {
  it("saves the live text, with a version when asked", async () => {
    replaceManuscript(room.doc, paragraph("Hello"));
    expect(await saveLiveDocument(DOC, null, { label: "Draft" })).toBe("version-1");
    expect(savedText()).toBe("Hello");
  });

  it("doesn't save an empty room over nothing", async () => {
    expect(await saveLiveDocument(DOC, null)).toBeNull();
    expect(db.saves).toHaveLength(0);
  });

  it("never lets an empty room wipe the saved text, and refills the room", async () => {
    replaceManuscript(room.doc, paragraph("Chapter one"));
    await saveLiveDocument(DOC, null);
    room.doc = new Y.Doc(); // the Liveblocks room was lost or reset
    room.doc.getMap("meta").set("schema", 3); // an editor opened it and claimed the schema
    await saveLiveDocument(DOC, null);
    expect(savedText()).toBe("Chapter one");
    expect(roomText()).toBe("Chapter one");
  });

  it("merges and retries when someone else saved in between", async () => {
    replaceManuscript(room.doc, paragraph("First"));
    await saveLiveDocument(DOC, null);
    replaceManuscript(room.doc, paragraph("Second"));
    db.conflictOnce = true;
    await saveLiveDocument(DOC, null);
    expect(savedText()).toBe("Second");
  });
});

describe("restoreVersion", () => {
  it("keeps the text being replaced as a version, then restores for everyone", async () => {
    replaceManuscript(room.doc, paragraph("Current text"));
    await restoreVersion(DOC, null, paragraph("Old text"), "user-1", "Before restoring");
    const safety = db.saves.find((s) => s.p_label === "Before restoring");
    expect(plainText(safety!.p_version_content as DocJSON).trim()).toBe("Current text");
    expect(roomText()).toBe("Old text");
    expect(savedText()).toBe("Old text");
  });
});
