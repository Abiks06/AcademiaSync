// Types for Liveblocks hooks: what a user looks like in presence lists and comments.
declare global {
  interface Liveblocks {
    UserMeta: {
      id: string;
      info: { name: string; avatar?: string; color: string };
    };
  }
}

export {};
