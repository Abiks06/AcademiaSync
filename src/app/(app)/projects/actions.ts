"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { AuthUnavailableError } from "@/lib/supabase/auth-errors";

export type FormState = {
  error?: string;
  /** What the user typed, so a failed submit doesn't clear the form. */
  values?: Record<string, string>;
  /** Idempotency key for the next submit; stays the same after a failure so a retry can't duplicate. */
  requestId?: string;
};

const UNIQUE_VIOLATION = "23505";

const requestId = z.string().uuid().optional().or(z.literal("").transform(() => undefined));

const projectSchema = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(120),
  field: z.string().trim().max(80).optional(),
  description: z.string().trim().max(600).optional(),
  accent: z.enum(["iris", "teal", "amber", "rose"]).default("iris"),
  requestId,
});

/** Signed-in user for an action, or a form error when Auth can't be reached. */
async function userForAction() {
  try {
    const { supabase, user } = await getUser();
    if (!user) redirect("/sign-in");
    return { ok: true as const, supabase, user };
  } catch (e) {
    if (e instanceof AuthUnavailableError) return { ok: false as const, error: e.message };
    throw e;
  }
}

function textValues(formData: FormData) {
  const values: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  });
  return values;
}

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = textValues(formData);
  const parsed = projectSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values, requestId: values.requestId };
  const { requestId: key, ...fields } = parsed.data;

  const auth = await userForAction();
  if (!auth.ok) return { error: auth.error, values, requestId: key };
  const { supabase, user } = auth;

  const insert = await supabase
    .from("projects")
    .insert({
      ...fields,
      field: fields.field || null,
      description: fields.description || null,
      created_by: user.id,
      client_request_id: key ?? null,
    })
    .select("id")
    .single();

  let id = insert.data?.id;
  if (insert.error?.code === UNIQUE_VIOLATION && key) {
    // This form was already submitted (double click, retry after a dropped
    // response). Open the project the first submit created.
    const existing = await supabase
      .from("projects")
      .select("id")
      .eq("created_by", user.id)
      .eq("client_request_id", key)
      .maybeSingle();
    id = existing.data?.id;
  }
  if (!id) {
    return { error: `Couldn't create the project: ${insert.error?.message ?? "please try again."}`, values, requestId: key };
  }

  revalidatePath("/projects");
  redirect(`/projects/${id}`);
}

const documentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the document a title.").max(200),
  requestId,
});

export async function createDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = textValues(formData);
  const parsed = documentSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values, requestId: values.requestId };
  const { projectId, title, requestId: key } = parsed.data;

  const auth = await userForAction();
  if (!auth.ok) return { error: auth.error, values, requestId: key };
  const { supabase, user } = auth;

  // The database issues the ID, so the UI never references an ID the server doesn't know.
  const { error } = await supabase
    .from("documents")
    .insert({ project_id: projectId, title, created_by: user.id, client_request_id: key ?? null });
  // A unique violation means this exact submit already went through.
  if (error && !(error.code === UNIQUE_VIOLATION && key)) {
    return { error: `Couldn't create the document: ${error.message}`, values, requestId: key };
  }

  revalidatePath(`/projects/${projectId}`);
  return { requestId: randomUUID() };
}
