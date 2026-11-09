// Sends email through Resend (resend.com/docs), from RESEND_FROM_EMAIL.

import "server-only";

export type Email = {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML version; `text` stays as the fallback for plain-text mail apps. */
  html?: string;
  attachment?: { filename: string; bytes: Uint8Array };
};

/** Resend rejects bursts, so sends are spaced this far apart. */
export const EMAIL_SPACING_MS = 600;

/** Sends one email. `idempotencyKey` makes a retry return the first send instead of emailing twice. */
export async function sendEmail(email: Email, idempotencyKey: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) throw new Error("Email isn't set up: RESEND_API_KEY or RESEND_FROM_EMAIL is missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachment
        ? [{ filename: email.attachment.filename, content: Buffer.from(email.attachment.bytes).toString("base64") }]
        : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
