import "server-only";

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type EmailResult = { ok: true } | { ok: false; error: string };

/** Sends one email through Resend (https://resend.com). Never throws. */
export async function sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<EmailResult> {
  if (!isEmailConfigured()) return { ok: false, error: "Email isn't set up on this server." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    console.error("[email] Resend refused", res.status, await res.text().catch(() => ""));
    return { ok: false, error: "The email service refused the message." };
  } catch (error) {
    console.error("[email] couldn't reach Resend", error);
    return { ok: false, error: "Couldn't reach the email service." };
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
