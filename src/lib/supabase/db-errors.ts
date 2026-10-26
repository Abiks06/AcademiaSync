/**
 * A message a person can act on, for a failed database call. The raw error is logged on
 * the server and never shown: it names tables, policies and constraints.
 * `action` finishes the sentence "Couldn't …", e.g. "save the source".
 */
export function dbErrorMessage(error: { code?: string; message?: string }, action: string) {
  console.error(`[database] couldn't ${action}:`, error.code, error.message);
  switch (error.code) {
    case "42501":
      return `You don't have permission to ${action}.`;
    case "23514":
    case "22P02":
    case "22001":
      return `Some of the details aren't valid, so we couldn't ${action}. Check them and try again.`;
    case "23505":
      return `That already exists, so we couldn't ${action}.`;
    case "23503":
      return `Something this refers to no longer exists, so we couldn't ${action}. Reload the page and try again.`;
    case "PGRST301":
    case "PGRST303":
      return "Your session has ended. Sign in again to continue.";
    default:
      return `Couldn't ${action}. Try again in a moment.`;
  }
}
