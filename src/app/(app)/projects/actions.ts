"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";

export type FormState = { error?: string };

const projectSchema = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(120),
  field: z.string().trim().max(80).optional(),
  description: z.string().trim().max(600).optional(),
  accent: z.enum(["iris", "teal", "amber", "rose"]).default("iris"),
});

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await getUser();
  if (!user) redirect("/sign-in");

  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, field: parsed.data.field || null, description: parsed.data.description || null, created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: `Couldn't create the project: ${error.message}` };

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

const documentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the document a title.").max(200),
});

export async function createDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = documentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await getUser();
  if (!user) redirect("/sign-in");

  // The database issues the ID, so the UI never references an ID the server doesn't know.
  const { error } = await supabase
    .from("documents")
    .insert({ project_id: parsed.data.projectId, title: parsed.data.title, created_by: user.id });
  if (error) return { error: `Couldn't create the document: ${error.message}` };

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return {};
}
