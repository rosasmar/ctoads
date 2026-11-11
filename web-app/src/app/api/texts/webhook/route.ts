// msgbubbles calls this for every event on our number (docs.msgbubbles.com/webhooks). We act only
// on texts received one to one: each is logged once by its message id, a number gets at most
// MAX_PER_HOUR replies, and the reply comes from lib/textCommands.ts. Needs MSGBUBBLES_WEBHOOK_SECRET.

import { NextRequest } from "next/server";
import { sendText } from "@/lib/msgbubbles";
import { supabase } from "@/lib/supabase";
import { replyTo, webhookSignatureIsValid } from "@/lib/textCommands";

const MAX_PER_HOUR = 20;

type Received = { type: string; message_id: string; from: string; text?: string; is_group?: boolean };

export async function POST(request: NextRequest) {
  const secret = process.env.MSGBUBBLES_WEBHOOK_SECRET;
  if (!secret) return new Response("Text commands aren't set up.", { status: 503 });
  // The signature covers the raw body, so it's read as text before parsing.
  const raw = await request.text();
  if (!webhookSignatureIsValid(secret, raw, request.headers.get("x-msgbubbles-signature"))) {
    return new Response("Bad signature.", { status: 401 });
  }
  const event = JSON.parse(raw) as Received;
  if (event.type !== "message.received" || event.is_group || !event.from || !event.text) return new Response(null, { status: 204 });

  try {
    const db = supabase();
    // msgbubbles retries until it gets a 2xx, so the same text can arrive twice: the first insert wins.
    const { error: logError } = await db
      .from("text_commands")
      .insert({ message_id: event.message_id, phone: event.from, command: event.text.slice(0, 200) });
    if (logError?.code === "23505") return new Response(null, { status: 204 });
    if (logError) throw logError;

    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count, error: countError } = await db
      .from("text_commands")
      .select("message_id", { count: "exact", head: true })
      .eq("phone", event.from)
      .gte("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) > MAX_PER_HOUR) return new Response(null, { status: 204 });

    const reply = await replyTo(event.from, event.text, request.nextUrl.origin);
    await sendText(event.from, reply, `reply-${event.message_id}`);
  } catch (e) {
    // Acknowledged anyway: a retry would be skipped as a duplicate, so it can't help.
    console.error(e);
  }
  return new Response(null, { status: 204 });
}
