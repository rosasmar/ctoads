// Sends texts through msgbubbles (docs.msgbubbles.com): iMessage or SMS, picked per recipient,
// from the number in NEXT_PUBLIC_MSGBUBBLES_NUMBER, optionally with an image.

import "server-only";
import { MSGBUBBLES_NUMBER } from "@/config";

const API = "https://api.msgbubbles.com/v1";

/** Whether alerts can go by text. Without a msgbubbles key, every alert goes by email instead. */
export const textingEnabled = () => Boolean(process.env.MSGBUBBLES_API_KEY && MSGBUBBLES_NUMBER);

function apiKey(): string {
  const key = process.env.MSGBUBBLES_API_KEY;
  if (!key || !MSGBUBBLES_NUMBER) throw new Error("Sending isn't set up: MSGBUBBLES_API_KEY or NEXT_PUBLIC_MSGBUBBLES_NUMBER is missing");
  return key;
}

/** Uploads a file to msgbubbles and returns its attachment id. Each id works for one message only. */
export async function stageAttachment(bytes: Uint8Array, type: string, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type }), filename);
  const res = await fetch(`${API}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${apiKey()}` }, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`msgbubbles ${res.status} ${body.error ?? ""}: ${body.message ?? ""}`);
  return body.data[0].id;
}

/**
 * Queues one text and resolves once msgbubbles accepts it. `idempotencyKey` makes a retry of the
 * same send return the first one instead of texting twice. Waits and retries once if rate limited.
 */
export async function sendText(to: string, text: string, idempotencyKey: string, attachmentIds?: string[]): Promise<void> {
  const key = apiKey();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ to, from_handle: MSGBUBBLES_NUMBER, text, attachment_ids: attachmentIds }),
    });
    if (res.ok) return;
    const retryAfter = Number(res.headers.get("Retry-After") ?? 0);
    if (res.status === 429 && attempt === 0 && retryAfter <= 10) {
      await new Promise((r) => setTimeout(r, Math.max(retryAfter, 1) * 1000));
      continue;
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(`msgbubbles ${res.status} ${body.error ?? ""}: ${body.message ?? ""}`);
  }
}
