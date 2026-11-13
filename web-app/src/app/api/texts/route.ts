// Linking a phone to text commands (lib/texts.ts). Changes need a signed WalletProof.
//   GET    ?account=…   whether that account has a linked number or a code waiting (never the number)
//   POST   { proof }    a new linking code, shown once, valid for 15 minutes; any wallet can link a
//                       number, while profile changes and votes by text still need a CTOad
//   DELETE { proof }    unlink the number and drop any code

import { NextRequest } from "next/server";
import { errorResponse, serverError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { codeHash, newCode } from "@/lib/textCommands";
import { CODE_MINUTES, LINK_TEXTS_ACTION, type TextsStatus, UNLINK_TEXTS_ACTION } from "@/lib/texts";
import { isProof, ProofError, verifySigner } from "@/lib/walletProof";

const TABLE = "text_numbers";

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account");
  if (!account) return errorResponse("Missing account.", 400);
  try {
    const { data, error: dbError } = await supabase()
      .from(TABLE)
      .select("phone, code_expires_at")
      .eq("account_id", account)
      .maybeSingle();
    if (dbError) return serverError(dbError);
    const status: TextsStatus = {
      linked: !!data?.phone,
      pending: !!data?.code_expires_at && new Date(data.code_expires_at) > new Date(),
    };
    return Response.json(status);
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  try {
    const accountId = await verifySigner(body.proof, LINK_TEXTS_ACTION);
    const code = newCode();
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
    // A new code replaces an old one. A number that's already linked stays linked until the code is used.
    const { error: dbError } = await supabase()
      .from(TABLE)
      .upsert({ account_id: accountId, code_hash: await codeHash(code), code_expires_at: expiresAt, updated_at: new Date().toISOString() });
    if (dbError) return serverError(dbError);
    return Response.json({ code, expiresAt });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  try {
    const accountId = await verifySigner(body.proof, UNLINK_TEXTS_ACTION);
    const { error: dbError } = await supabase().from(TABLE).delete().eq("account_id", accountId);
    if (dbError) return serverError(dbError);
    return Response.json({ linked: false });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}
