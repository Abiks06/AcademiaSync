// Types for Liveblocks hooks across the app.
declare global {
  interface Liveblocks {
    Presence: {
      /** The editor schema this tab runs, so newer tabs can hold back new kinds of content. */
      schema?: number;
      /** When this person last typed (ms since epoch), so their avatar can pulse for others. */
      typingAt?: number;
      /** The top-level block (paragraph, heading…) this person's cursor is in, for the margin markers. */
      block?: number;
      /** What this person is looking at: the block at the top of their screen, and how far into it. Followers scroll to match. */
      view?: { block: number; offset: number };
    };
    UserMeta: {
      id: string;
      info: { name: string; avatar?: string; color: string };
    };
    // Sent by the server when someone's access to the project changes.
    RoomEvent: { type: "access-changed" };
  }
}

export {};
