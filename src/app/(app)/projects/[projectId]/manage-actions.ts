"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser } from "@/lib/supabase/action-user";
import { dbErrorMessage } from "@/lib/supabase/db-errors";
import { closeRooms } from "@/lib/liveblocks/access";

export type ManageResult = { ok: true } | { ok: false; error: string };

const NETWORK = "Something went wrong. Try again in a moment.";
const uuid = z.string().uuid();

const detailsSchema = z.object({
  projectId: uuid,
  name: z.string().trim().min(1, "Give your project a name.").max(120, "Keep the name under 120 characters."),
  field: z.string().trim().max(80, "Keep the field under 80 characters."),
  description: z.string().trim().max(600, "Keep the description under 600 characters."),
  accent: z.enum(["iris", "teal", "amber", "rose"]),
});

/** Owners and authors rename a project or change its field, description and colour. */
export async function updateProjectDetails(input: z.input<typeof detailsSchema>): Promise<ManageResult> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { projectId, name, field, description, accent } = parsed.data;

  try {
    const { data, error } = await auth.supabase
      .from("projects")
      .update({ name, field: field || null, description: description || null, accent })
      .eq("id", projectId)
      .select("id");
    if (error) return { ok: false, error: dbErrorMessage(error, "update this project") };
    if (!data.length) return { ok: false, error: "Only owners and authors can change the project's details." };
  } catch {
    return { ok: false, error: NETWORK };
  }
  revalidatePath("/projects", "layout");
  return { ok: true };
}

/** Owners delete a project with everything in it. Open editors are closed. */
export async function deleteProject(input: { projectId: string }): Promise<ManageResult> {
  if (!uuid.safeParse(input.projectId).success) return { ok: false, error: "Unknown project." };
  const auth = await actionUser();
  if (!auth.ok) return auth;

  try {
    // Read before deleting: afterwards nobody can see the documents to close their rooms.
    const { data: documents } = await auth.supabase.from("documents").select("id").eq("project_id", input.projectId);
    const { data, error } = await auth.supabase.from("projects").delete().eq("id", input.projectId).select("id");
    if (error) return { ok: false, error: dbErrorMessage(error, "delete this project") };
    if (!data.length) return { ok: false, error: "Only owners can delete a project." };
    await closeRooms((documents ?? []).map((d) => d.id));
  } catch {
    return { ok: false, error: NETWORK };
  }
  revalidatePath("/projects", "layout");
  return { ok: true };
}

/** Owners and authors delete a manuscript and its version history. */
export async function deleteDocument(input: { projectId: string; documentId: string }): Promise<ManageResult> {
  if (!uuid.safeParse(input.projectId).success || !uuid.safeParse(input.documentId).success) return { ok: false, error: "Unknown manuscript." };
  const auth = await actionUser();
  if (!auth.ok) return auth;

  try {
    const { data, error } = await auth.supabase
      .from("documents")
      .delete()
      .eq("id", input.documentId)
      .eq("project_id", input.projectId)
      .select("id");
    if (error) return { ok: false, error: dbErrorMessage(error, "delete this manuscript") };
    if (!data.length) return { ok: false, error: "Only owners and authors can delete manuscripts." };
    await closeRooms([input.documentId]);
  } catch {
    return { ok: false, error: NETWORK };
  }
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/projects", "layout");
  return { ok: true };
}
