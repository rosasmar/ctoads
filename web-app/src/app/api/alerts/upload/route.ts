// Before sending an alert with an image, the browser asks here for a URL to upload it to S3.
//   POST { proof, text, image: { sha256, type, size } }  ->  { url }
// The proof is the same one the send route checks (it signs the text and the image's SHA-256), so
// sending an image still takes a single wallet signature, and only CTOad holders can upload.

import { NextRequest } from "next/server";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, sendAction } from "@/lib/alerts";
import { errorResponse, serverError } from "@/lib/api";
import { imageKey, uploadUrl } from "@/lib/s3";
import { isProof, ProofError, verifyHolder } from "@/lib/walletProof";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isProof(body.proof)) return errorResponse("Missing or malformed signature.", 400);
  const { sha256, type, size } = body.image ?? {};
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256) || !(type in IMAGE_TYPES)) {
    return errorResponse("Attach a JPEG, PNG, GIF or WebP image.", 400);
  }
  if (typeof size !== "number" || size <= 0 || size > MAX_IMAGE_BYTES) {
    return errorResponse(`Images can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`, 400);
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  try {
    await verifyHolder(body.proof, sendAction(text, sha256));
    return Response.json({ url: await uploadUrl(imageKey(sha256, type), type, size) });
  } catch (e) {
    return e instanceof ProofError ? errorResponse(e.message, 403) : serverError(e);
  }
}
