import "server-only";
import { getLiveblocks, isLiveblocksConfigured } from "./server";
import { roomIdFor } from "./rooms";

/**
 * Tells every open editor in these documents that someone's access changed. Each editor
 * then asks for a new token, so a removed member's tab is shut out and a demoted one turns
 * read-only straight away instead of when its token expires. Never throws.
 */
export async function announceAccessChange(documentIds: string[]) {
  if (!isLiveblocksConfigured()) return;
  const liveblocks = getLiveblocks();
  await Promise.all(
    documentIds.map((id) =>
      // A room nobody has opened yet doesn't exist, which is fine.
      liveblocks.broadcastEvent(roomIdFor(id), { type: "access-changed" }).catch(() => undefined),
    ),
  );
}

/**
 * Shuts and deletes the rooms of documents that were just deleted. Open editors are told
 * first, so they show "no longer available" instead of retrying. Never throws.
 */
export async function closeRooms(documentIds: string[]) {
  if (!isLiveblocksConfigured()) return;
  const liveblocks = getLiveblocks();
  await announceAccessChange(documentIds);
  await Promise.all(documentIds.map((id) => liveblocks.deleteRoom(roomIdFor(id)).catch(() => undefined)));
}
