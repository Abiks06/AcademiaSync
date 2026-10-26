"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { acceptInvite } from "./actions";

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInvite, {});
  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="token" value={token} />
      <button disabled={pending} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-bg disabled:opacity-60">
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Join the project
      </button>
      <p className="mt-3 text-xs text-faint">Signed in as {email}</p>
      {state.error && <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
