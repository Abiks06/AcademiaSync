import { getUser } from "./server";
import { AuthUnavailableError } from "./auth-errors";

/**
 * The signed-in user for a server action, as a value the action can return
 * to the form instead of throwing: a signed-out user and an Auth outage each
 * get their own message.
 */
export async function actionUser() {
  try {
    const { supabase, user } = await getUser();
    if (!user) return { ok: false as const, error: "Your session has ended. Sign in again to continue." };
    return { ok: true as const, supabase, user };
  } catch (e) {
    if (e instanceof AuthUnavailableError) return { ok: false as const, error: e.message };
    throw e;
  }
}
