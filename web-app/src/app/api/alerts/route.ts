// Signing up for alerts. Changes need a signed WalletProof (lib/walletProof.ts).
//   GET    ?account=…         whether that account is signed up (never the number)
//   POST   { proof, phone }   sign up or change the number; only CTOad holders
//   DELETE { proof }          stop alerts and delete the number; anyone signed up, even after selling

import { NextRequest } from "next/server";
import { normalizePhone, subscribeAction, UNSUBSCRIBE_ACTION, type WalletProof } from "@/lib/alerts";
import { supabase } from "@/lib/supabase";
import { errorResponse, serverError } from "@/lib/api";
import { isProof, ProofError, verifyHolder, verifySigner } from "@/lib/walletProof";

const TABLE = "alert_subscribers";


/** Reads the JSON body and its proof, or returns the error response to send instead. */
async function readBody(request: NextRequest): Promise<{ proof: WalletProof; phone?: unknown } | Response> {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  return body;
}

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account");
  if (!account) return errorResponse("Missing account.", 400);
  try {
    const { count, error: dbError } = await supabase()
      .from(TABLE)
      .select("account_id", { count: "exact", head: true })
      .eq("account_id", account);
    if (dbError) return serverError(dbError);
    return Response.json({ subscribed: (count ?? 0) > 0 });
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
    const { error: dbError } = await supabase()
      .from(TABLE)
      .upsert({ account_id: accountId, phone, updated_at: new Date().toISOString() });
    // 23505: unique violation, i.e. the number is already signed up with another wallet.
    if (dbError?.code === "23505") return errorResponse("This number is already signed up with another wallet.", 409);
    if (dbError) return serverError(dbError);
    return Response.json({ subscribed: true });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}

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
