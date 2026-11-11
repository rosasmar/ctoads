// Holders' public profiles (lib/profile.ts). Changes need a signed WalletProof (lib/walletProof.ts).
//   GET    ?handle=… or ?account=…   the profile, or 404; profiles are public
//   POST   { proof, profile }        create or change your profile; only CTOad holders. Private
//                                     AI moderation checks the bio and link names first.
//   DELETE { proof }                 delete your profile, even after selling

import { NextRequest } from "next/server";
import { errorResponse, serverError } from "@/lib/api";
import { moderate } from "@/lib/moderation";
import { DELETE_PROFILE_ACTION, normalizeProfile, type Profile, profileAction } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { isProof, ProofError, verifyHolder, verifySigner } from "@/lib/walletProof";

const TABLE = "profiles";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const handle = params.get("handle")?.toLowerCase();
  const account = params.get("account");
  if (!handle && !account) return errorResponse("Missing handle or account.", 400);
  try {
    const query = supabase().from(TABLE).select("account_id, handle, bio, links");
    const { data, error: dbError } = await (handle ? query.eq("handle", handle) : query.eq("account_id", account!)).maybeSingle();
    if (dbError) return serverError(dbError);
    if (!data) return errorResponse("No profile.", 404);
    return Response.json({ accountId: data.account_id, handle: data.handle, bio: data.bio, links: data.links });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  const profile = normalizeProfile(body.profile ?? {});
  if (typeof profile === "string") return errorResponse(profile, 400);
  try {
    const accountId = await verifyHolder(body.proof, profileAction(profile));
    const moderation = await moderate(publicText(profile));
    if (moderation.flagged) {
      return errorResponse(`This profile wasn't saved: it was flagged for ${moderation.categories.join(", ")}. See the terms.`, 422);
    }
    const { error: dbError } = await supabase()
      .from(TABLE)
      .upsert({ account_id: accountId, ...profile, updated_at: new Date().toISOString() });
    // 23505: unique violation, i.e. another account has this handle.
    if (dbError?.code === "23505") return errorResponse(`@${profile.handle} is taken. Pick another one.`, 409);
    if (dbError) return serverError(dbError);
    return Response.json({ accountId, ...profile });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  try {
    const accountId = await verifySigner(body.proof, DELETE_PROFILE_ACTION);
    const { error: dbError } = await supabase().from(TABLE).delete().eq("account_id", accountId);
    if (dbError) return serverError(dbError);
    return Response.json({ deleted: true });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}

/** Everything others will read on the profile: the handle, bio and link names. */
const publicText = (p: Profile) => [`@${p.handle}`, p.bio, ...p.links.map((l) => l.label)].join("\n");
