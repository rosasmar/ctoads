// msgbubbles calls this for every event on our number (docs.msgbubbles.com/webhooks). When someone
// texts STOP, their number is deleted, whether or not they hold a wallet, and they get a reply.

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { errorResponse, serverError } from "@/lib/api";
import { sendText } from "@/lib/msgbubbles";
import { supabase } from "@/lib/supabase";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
/** Deliveries signed more than this long ago are rejected, as msgbubbles recommends. */
const TOLERANCE_SECS = 300;

/** Checks `X-msgbubbles-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. */
function signatureIsValid(secret: string, rawBody: string, header: string | null): boolean {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=", 2)));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECS) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return expected.length === parts.v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

export async function POST(request: NextRequest) {
  const secret = process.env.MSGBUBBLES_WEBHOOK_SECRET;
  if (!secret) return errorResponse("Webhook isn't set up.", 503);
  const rawBody = await request.text();
  if (!signatureIsValid(secret, rawBody, request.headers.get("x-msgbubbles-signature"))) {
    return errorResponse("Bad signature.", 401);
  }

  const event = JSON.parse(rawBody);
  const word = typeof event.text === "string" ? event.text.trim().toUpperCase() : "";
  if (event.type !== "message.received" || event.is_group || !STOP_WORDS.has(word)) return Response.json({ ok: true });

  try {
    const { data, error } = await supabase().from("alert_subscribers").delete().eq("phone", event.from).select("account_id");
    if (error) return serverError(error);
    // msgbubbles may deliver the same event twice; the idempotency key keeps it to one reply.
    if (data.length > 0) {
      await sendText(event.from, "You won't get CTOads alerts anymore. Your number is deleted.", `stop-${event.message_id}`);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
