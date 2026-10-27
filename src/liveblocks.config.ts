// Types for Liveblocks hooks across the app.
declare global {
  interface Liveblocks {
    Presence: {
      /** The editor schema this tab runs, so newer tabs can hold back new kinds of content. */
      schema?: number;
      /** When this person last typed (ms since epoch), so their avatar can pulse for others. */
      typingAt?: number;
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
