// Sending an alert: a CTOad holder texts every other signed-up holder, from the msgbubbles number.
//   GET  ?account=…        how many alerts that account can still send today
//   POST { proof, text, image? }   send one; the proof signs the exact text and the image's SHA-256
//                                  (lib/alerts.ts `sendAction`). The image was uploaded via ../upload.
// OpenAI's moderation checks the text first. Only subscribers who still hold a CTOad get it, and
// never the sender.

import { NextRequest } from "next/server";
import { alertText, DAILY_ALERT_LIMIT, IMAGE_TYPES, MAX_ALERT_LENGTH, REMOVE_PATH, sendAction, sha256Hex } from "@/lib/alerts";
import { ctoadHolders } from "@/lib/cto";
import { moderate } from "@/lib/moderation";
import { sendText, stageAttachment } from "@/lib/msgbubbles";
import { imageKey, readImage } from "@/lib/s3";
import { supabase } from "@/lib/supabase";
import { errorResponse, serverError } from "@/lib/api";
import { isProof, ProofError, verifyHolder } from "@/lib/walletProof";

/** How many texts go out at once. msgbubbles allows 120 requests a minute per key. */
const PARALLEL = 5;


/** Alerts `accountId` can still send in the 24 hours before now. */
async function remainingToday(accountId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: dbError } = await supabase()
    .from("alert_messages")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .gte("created_at", since);
  if (dbError) throw dbError;
  return Math.max(DAILY_ALERT_LIMIT - (count ?? 0), 0);
}

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account");
  if (!account) return errorResponse("Missing account.", 400);
  try {
    return Response.json({ remaining: await remainingToday(account) });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_ALERT_LENGTH) return errorResponse(`Write between 1 and ${MAX_ALERT_LENGTH} characters.`, 400);
  const { sha256, type } = body.image ?? {};
  const hasImage = body.image != null;
  if (hasImage && (typeof sha256 !== "string" || !(type in IMAGE_TYPES))) return errorResponse("Malformed image.", 400);

  try {
    const sender = await verifyHolder(body.proof, sendAction(text, hasImage ? sha256 : undefined));
    const remaining = await remainingToday(sender);
    if (remaining === 0) return errorResponse(`You've sent ${DAILY_ALERT_LIMIT} alerts in the last 24 hours. Try again later.`, 429);

    // The stored file must be the one that was signed: it's named by its hash, and the hash is rechecked.
    const key = hasImage ? imageKey(sha256, type) : null;
    const image = key ? await readImage(key).catch(() => null) : null;
    if (key && (!image || image.type !== type || (await sha256Hex(image.bytes as BufferSource)) !== sha256)) {
      return errorResponse("The image didn't upload. Please try again.", 400);
    }

    const moderation = await moderate(text, image ?? undefined);
    if (moderation.flagged) {
      return errorResponse(`This alert wasn't sent: it was flagged for ${moderation.categories.join(", ")}. See the terms.`, 422);
    }

    const [holders, subscribers] = await Promise.all([
      ctoadHolders(),
      supabase().from("alert_subscribers").select("account_id, phone"),
    ]);
    if (subscribers.error) return serverError(subscribers.error);
    const recipients = subscribers.data.filter((s) => s.account_id !== sender && holders.has(s.account_id));

    const { data: logged, error: logError } = await supabase()
      .from("alert_messages")
      .insert({ account_id: sender, text, recipients: recipients.length, image_key: key })
      .select("id")
      .single();
    if (logError) return serverError(logError);

    const message = alertText(text, sender, `${request.nextUrl.origin}${REMOVE_PATH}`);
    let failed = 0;
    for (let i = 0; i < recipients.length; i += PARALLEL) {
      const results = await Promise.allSettled(
        recipients
          .slice(i, i + PARALLEL)
          .map(async (r) => {
            // msgbubbles attachments are single-use, so each recipient gets their own copy.
            const attachments = image && key ? [await stageAttachment(image.bytes, image.type, key.split("/")[1])] : undefined;
            await sendText(r.phone, message, `alert-${logged.id}-${r.account_id}`, attachments);
          }),
      );
      results.forEach((r) => {
        if (r.status === "rejected") {
          failed++;
          console.error(r.reason);
        }
      });
    }
    return Response.json({ sent: recipients.length - failed, failed, remaining: remaining - 1 });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}
