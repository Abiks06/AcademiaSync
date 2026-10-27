"use server";

import { redirect } from "next/navigation";
import { actionUser } from "@/lib/supabase/action-user";

export type AcceptState = { error?: string };

export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  if (!/^[0-9a-f]{32,128}$/.test(token)) return { error: "This invite link is invalid." };
  const auth = await actionUser();
  if (!auth.ok) return { error: auth.error };

  const { data: projectId, error } = await auth.supabase.rpc("accept_project_invite", { p_token: token });
  // The database explains a wrong address or an expired link in words meant for people.
  if (error) return { error: error.code === "P0001" ? error.message : "Couldn't accept the invite. Try again in a moment." };
  redirect(`/projects/${projectId}`);
}
