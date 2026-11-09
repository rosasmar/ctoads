// Sends texts through msgbubbles (docs.msgbubbles.com): iMessage or SMS, picked per recipient,
// from the number in NEXT_PUBLIC_MSGBUBBLES_NUMBER.

import "server-only";
import { MSGBUBBLES_NUMBER } from "@/config";

const API = "https://api.msgbubbles.com/v1";

/**
 * Queues one text and resolves once msgbubbles accepts it. `idempotencyKey` makes a retry of the
 * same send return the first one instead of texting twice. Waits and retries once if rate limited.
 */
export async function sendText(to: string, text: string, idempotencyKey: string): Promise<void> {
  const key = process.env.MSGBUBBLES_API_KEY;
  if (!key || !MSGBUBBLES_NUMBER) throw new Error("Sending isn't set up: MSGBUBBLES_API_KEY or NEXT_PUBLIC_MSGBUBBLES_NUMBER is missing");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ to, from_handle: MSGBUBBLES_NUMBER, text }),
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
