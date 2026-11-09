// Adding an email for alerts. Resend sends a 6-digit code, and the address only counts once the
// code comes back.
//   POST   { proof, email }        a holder asks for a code (signs "Send alerts by email to …")
//   PUT    { accountId, code }     the code from the email; 5 tries, valid for 10 minutes
//   DELETE { proof }               stop email alerts and delete the address (signs "Stop email alerts")

import { createHash, randomInt } from "node:crypto";
import { NextRequest } from "next/server";
import { emailAction, normalizeEmail, STOP_EMAIL_ACTION } from "@/lib/alerts";
import { errorResponse, serverError } from "@/lib/api";
import { sendEmail } from "@/lib/resend";
import { supabase } from "@/lib/supabase";
import { isProof, ProofError, verifyHolder, verifySigner } from "@/lib/walletProof";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (accountId: string, code: string) => createHash("sha256").update(`${accountId}:${code}`).digest("hex");

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : null;
  if (!email) return errorResponse("Enter a valid email address.", 400);
  try {
    const accountId = await verifyHolder(body.proof, emailAction(email));
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error } = await supabase()
      .from("alert_email_codes")
      .upsert({
        account_id: accountId,
        email,
        code_hash: hashCode(accountId, code),
        attempts: 0,
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      });
    if (error) return serverError(error);
    await sendEmail(
      {
        to: email,
        subject: `Your CTOads alerts code: ${code}`,
        text: `Enter ${code} on the CTOads Alerts page to get alerts at this address. It expires in 10 minutes.\n\nIf you didn't ask for this, ignore this email.`,
      },
      `code-${accountId}-${body.proof.nonce}`,
    );
    return Response.json({ sent: true });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!accountId || !/^\d{6}$/.test(code)) return errorResponse("Enter the 6-digit code from the email.", 400);
  try {
    const db = supabase();
    const { data: pending, error } = await db.from("alert_email_codes").select().eq("account_id", accountId).maybeSingle();
    if (error) return serverError(error);
    if (!pending || new Date(pending.expires_at).getTime() < Date.now() || pending.attempts >= MAX_ATTEMPTS) {
      return errorResponse("This code has expired. Ask for a new one.", 400);
    }
    if (pending.code_hash !== hashCode(accountId, code)) {
      await db.from("alert_email_codes").update({ attempts: pending.attempts + 1 }).eq("account_id", accountId);
      return errorResponse("That code doesn't match.", 400);
    }

    const { data: existing } = await db.from("alert_subscribers").select("phone").eq("account_id", accountId).maybeSingle();
    const { error: saveError } = await db.from("alert_subscribers").upsert({
      account_id: accountId,
      email: pending.email,
      // Someone who already gets texts now gets both; they can switch on the Alerts page.
      channels: existing?.phone ? "both" : "email",
      updated_at: new Date().toISOString(),
    });
    // 23505: unique violation, i.e. the address is already signed up with another wallet.
    if (saveError?.code === "23505") return errorResponse("This email is already signed up with another wallet.", 409);
    if (saveError) return serverError(saveError);
    await db.from("alert_email_codes").delete().eq("account_id", accountId);
    return Response.json({ verified: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  try {
    const accountId = await verifySigner(body.proof, STOP_EMAIL_ACTION);
    const db = supabase();
    const { data: existing, error } = await db.from("alert_subscribers").select("phone").eq("account_id", accountId).maybeSingle();
    if (error) return serverError(error);
    const { error: saveError } = existing?.phone
      ? await db.from("alert_subscribers").update({ email: null, channels: "text" }).eq("account_id", accountId)
      : await db.from("alert_subscribers").delete().eq("account_id", accountId);
    if (saveError) return serverError(saveError);
    return Response.json({ deleted: true });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}
