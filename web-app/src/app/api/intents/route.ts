// Passes top-up requests to NEAR Intents' 1Click API (lib/intents.ts). 1Click works without a key
// (it then keeps 0.2% of each swap); set ONECLICK_API_KEY to use one.
//   POST { asset, amount, recipient, refundTo, dry }  a quote. amount is in the asset's smallest
//                                                     unit. With dry: false the quote has a deposit
//                                                     address; 1Click says until when it's valid.
//   GET  ?depositAddress=…                            how that top-up is going

import { NextRequest } from "next/server";
import { errorResponse, serverError } from "@/lib/api";
import { TOPUP_ASSETS, WNEAR_CONTRACT } from "@/lib/intents";

const ONECLICK = "https://1click.chaindefuser.com/v0";
const SLIPPAGE_BPS = 100; // 1%
const DEADLINE_MINUTES = 30;

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

function headers(): HeadersInit {
  const key = process.env.ONECLICK_API_KEY;
  return { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}) };
}

/** 1Click's own error message, e.g. "refundTo is not valid", or a generic one. */
async function oneClickError(res: Response): Promise<Response> {
  const json = await res.json().catch(() => ({}));
  const message = typeof json.message === "string" ? json.message : "NEAR Intents couldn't answer. Try again.";
  return errorResponse(message, res.status >= 500 ? 502 : 400);
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
  const refundTo = typed || PREVIEW_REFUND[asset.kind];
  try {
    const res = await fetch(`${ONECLICK}/quote`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        dry,
        swapType: "EXACT_INPUT",
        slippageTolerance: SLIPPAGE_BPS,
        originAsset: asset.id,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: `nep141:${WNEAR_CONTRACT}`,
        amount: body.amount,
        refundTo,
        refundType: "ORIGIN_CHAIN",
        recipient: body.recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + DEADLINE_MINUTES * 60_000).toISOString(),
      }),
    });
    if (!res.ok) return oneClickError(res);
    const { quote } = await res.json();
    return Response.json({
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      minAmountOut: quote.minAmountOut,
      amountInUsd: quote.amountInUsd,
      timeEstimate: quote.timeEstimate,
      depositAddress: quote.depositAddress,
      deadline: quote.deadline,
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function GET(request: NextRequest) {
  const depositAddress = request.nextUrl.searchParams.get("depositAddress");
  if (!depositAddress || depositAddress.length > 100) return errorResponse("Missing deposit address.", 400);
  try {
    const res = await fetch(`${ONECLICK}/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return oneClickError(res);
    const json = await res.json();
    return Response.json({ status: json.status });
  } catch (e) {
    return serverError(e);
  }
}
