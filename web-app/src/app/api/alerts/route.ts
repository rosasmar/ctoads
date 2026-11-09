// Signing up for alerts. Changes need a signed WalletProof (lib/walletProof.ts).
//   GET    ?account=…            whether that account is signed up, how, and where alerts go
//                                 (never the number or address)
//   POST   { proof, phone }      sign up or change the number; only CTOad holders
//   PATCH  { proof, channels }   get alerts by text, email or both
//   DELETE { proof }             stop all alerts and delete the account's details; anyone signed up,
//                                 even after selling

import { NextRequest } from "next/server";
import {
  type AlertsStatus,
  CHANNELS,
  type Channels,
  channelsAction,
  normalizePhone,
  subscribeAction,
  UNSUBSCRIBE_ACTION,
  type WalletProof,
} from "@/lib/alerts";
import { textingEnabled } from "@/lib/msgbubbles";
import { supabase } from "@/lib/supabase";
import { errorResponse, serverError } from "@/lib/api";
import { isProof, ProofError, verifyHolder, verifySigner } from "@/lib/walletProof";

const TABLE = "alert_subscribers";


/** Reads the JSON body and its proof, or returns the error response to send instead. */
async function readBody(request: NextRequest): Promise<{ proof: WalletProof; phone?: unknown; channels?: unknown } | Response> {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  return body;
}

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account");
  if (!account) return errorResponse("Missing account.", 400);
  try {
    const { data, error: dbError } = await supabase()
      .from(TABLE)
      .select("phone, email, channels")
      .eq("account_id", account)
      .maybeSingle();
    if (dbError) return serverError(dbError);
    const status: AlertsStatus = {
      subscribed: !!data,
      hasPhone: !!data?.phone,
      hasEmail: !!data?.email,
      channels: data?.channels ?? null,
      textEnabled: textingEnabled(),
    };
    return Response.json(status);
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : null;
  if (!phone) return errorResponse("Enter your number in international format, e.g. +12025550123.", 400);
  try {
    const accountId = await verifyHolder(body.proof, subscribeAction(phone));
    const { data: existing } = await supabase().from(TABLE).select("email").eq("account_id", accountId).maybeSingle();
    const { error: dbError } = await supabase()
      .from(TABLE)
      // Someone who already gets emails now gets both; they can switch on the Alerts page.
      .upsert({ account_id: accountId, phone, channels: existing?.email ? "both" : "text", updated_at: new Date().toISOString() });
    // 23505: unique violation, i.e. the number is already signed up with another wallet.
    if (dbError?.code === "23505") return errorResponse("This number is already signed up with another wallet.", 409);
    if (dbError) return serverError(dbError);
    return Response.json({ subscribed: true });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}

export async function PATCH(request: NextRequest) {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const channels = CHANNELS.find((c) => c === body.channels);
  if (!channels) return errorResponse("Pick text, email or both.", 400);
  try {
    const accountId = await verifySigner(body.proof, channelsAction(channels));
    const { data, error: dbError } = await supabase().from(TABLE).select("phone, email").eq("account_id", accountId).maybeSingle();
    if (dbError) return serverError(dbError);
    if (!data) return errorResponse("Sign up first.", 400);
    const missing = needs(channels).find((c) => !data[c]);
    if (missing) return errorResponse(`Add ${missing === "phone" ? "a phone number" : "an email"} first.`, 400);
    const { error: saveError } = await supabase().from(TABLE).update({ channels }).eq("account_id", accountId);
    if (saveError) return serverError(saveError);
    return Response.json({ channels });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}

/** The contact details a choice of channels needs. */
const needs = (channels: Channels): ("phone" | "email")[] =>
  channels === "both" ? ["phone", "email"] : [channels === "text" ? "phone" : "email"];

export async function DELETE(request: NextRequest) {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  try {
    const accountId = await verifySigner(body.proof, UNSUBSCRIBE_ACTION);
    const { error: dbError } = await supabase().from(TABLE).delete().eq("account_id", accountId);
    if (dbError) return serverError(dbError);
    return Response.json({ subscribed: false });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}
