// Passes top-up requests from the top-up card to NEAR Intents' 1Click API (lib/oneClick.ts).
//   POST { asset, amount, recipient, refundTo, dry }  a quote. amount is in the asset's smallest
//                                                     unit. With dry: false the quote has a deposit
//                                                     address; 1Click says until when it's valid.
//   GET  ?depositAddress=…                            how that top-up is going

import { NextRequest } from "next/server";
import { errorResponse, serverError } from "@/lib/api";
import { TOPUP_ASSETS } from "@/lib/intents";
import { OneClickError, requestQuote, topUpStatus } from "@/lib/oneClick";

/**
 * 1Click wants a refund address even for a price preview. Until someone types theirs, a preview
 * uses a well-known public address of the right kind. Nothing is ever sent to it: a preview has
 * no deposit address.
 */
const PREVIEW_REFUND = {
  evm: "0x1111111111111111111111111111111111111111",
  sol: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // the USDC token's address on Solana
  btc: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
};

/** 1Click's own error message, or a generic 500. */
function failed(e: unknown): Response {
  if (e instanceof OneClickError) return errorResponse(e.message, e.status >= 500 ? 502 : 400);
  return serverError(e);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const asset = TOPUP_ASSETS.find((a) => a.id === body?.asset);
  if (!asset) return errorResponse("Pick a coin to top up with.", 400);
  if (typeof body.amount !== "string" || !/^[1-9]\d{0,40}$/.test(body.amount)) return errorResponse("Enter an amount.", 400);
  if (typeof body.recipient !== "string" || !/^[a-z0-9._-]{2,64}$/.test(body.recipient)) {
    return errorResponse("Connect a NEAR wallet first.", 400);
  }
  const dry = body.dry !== false;
  const typed = typeof body.refundTo === "string" ? body.refundTo.trim() : "";
  if (typed.length > 100 || (!dry && !typed)) return errorResponse(`Enter your ${asset.chain} address for refunds.`, 400);
  try {
    return Response.json(
      await requestQuote({ asset, amount: body.amount, recipient: body.recipient, refundTo: typed || PREVIEW_REFUND[asset.kind], dry }),
    );
  } catch (e) {
    return failed(e);
  }
}

export async function GET(request: NextRequest) {
  const depositAddress = request.nextUrl.searchParams.get("depositAddress");
  if (!depositAddress || depositAddress.length > 100) return errorResponse("Missing deposit address.", 400);
  try {
    return Response.json({ status: await topUpStatus(depositAddress) });
  } catch (e) {
    return failed(e);
  }
}
