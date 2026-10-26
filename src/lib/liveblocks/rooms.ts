import type { ProjectRole } from "@/lib/supabase/types";

const ROOM_PREFIX = "doc:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One collaboration room per document, so access is decided per manuscript. */
export function roomIdFor(documentId: string) {
  return `${ROOM_PREFIX}${documentId}`;
}

/** Returns the document id a room belongs to, or null for anything we didn't create. */
export function documentIdFromRoom(room: unknown) {
  if (typeof room !== "string" || !room.startsWith(ROOM_PREFIX)) return null;
  const id = room.slice(ROOM_PREFIX.length);
  return UUID.test(id) ? id : null;
}

/** Roles that may change the manuscript text. Commenters and reviewers read and comment. */
export function canEditRole(role: ProjectRole | null | undefined) {
  return role === "owner" || role === "author" || role === "contributor";
}

const CURSOR_COLORS = ["#8b95ff", "#4fd8c4", "#f5b95f", "#ff7a90", "#7cc4ff", "#b794f6"];

/** A stable colour per person, so their cursor looks the same in every session. */
export function userColor(userId: string) {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}
