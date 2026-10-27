import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function isAdminConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * The server's own Supabase client, with the secret key. It bypasses row-level security,
 * so use it only after checking who is asking, and only for what browsers may never do
 * themselves (writing history, keeping the live document).
 */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server-side saving is not configured. Set SUPABASE_SECRET_KEY (see .env.example).");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Who the server saves as. With the secret key it saves as itself (the only option for the
 * Liveblocks webhook). Without it, it saves as the signed-in person, through database
 * functions that check their role (migration 20261027090000).
 */
export type Saver = SupabaseClient<Database> | null;

/** True when the server can save manuscripts for this request. */
export function canStore(saver: Saver) {
  return isAdminConfigured() || saver !== null;
}

type SaveArgs = Database["public"]["Functions"]["save_document_state"]["Args"];

/** The manuscript's saved Yjs state as Postgres hex (`\x…`), or null if none is saved. */
export async function readStoredState(documentId: string, saver: Saver): Promise<string | null> {
  if (isAdminConfigured()) {
    const { data, error } = await adminClient().from("document_state").select("ydoc").eq("document_id", documentId).maybeSingle();
    if (error) throw new Error(`Couldn't read the saved manuscript: ${error.message}`);
    return data?.ydoc ?? null;
  }
  if (!saver) throw new Error("No one to read the saved manuscript as.");
  const { data, error } = await saver.rpc("member_document_state", { p_document: documentId });
  if (error) throw new Error(`Couldn't read the saved manuscript: ${error.message}`);
  return data ?? null;
}

/** Saves the manuscript's state (and a version, when asked). Returns the new version's id. */
export async function writeStoredState(args: SaveArgs, saver: Saver) {
  if (isAdminConfigured()) return adminClient().rpc("save_document_state", args);
  if (!saver) throw new Error("No one to save the manuscript as.");
  const { p_created_by: _createdBy, ...rest } = args;
  void _createdBy; // the database records the signed-in person
  return saver.rpc("member_save_document_state", rest);
}
