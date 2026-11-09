// "I didn't sign up for this": anyone can remove a phone number from alerts, without a wallet.
//   POST { phone }   delete that number's sign-up, if there is one
// The answer is the same whether or not the number was signed up, so nobody can use this to find
// out who gets alerts. The texting number is outbound only, so replying STOP isn't possible.

import { NextRequest } from "next/server";
import { normalizePhone } from "@/lib/alerts";
import { errorResponse, serverError } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : null;
  if (!phone) return errorResponse("Enter the number in international format, e.g. +12025550123.", 400);
  try {
    const { error } = await supabase().from("alert_subscribers").delete().eq("phone", phone);
    if (error) return serverError(error);
    return Response.json({ removed: true });
  } catch (e) {
    return serverError(e);
  }
}
