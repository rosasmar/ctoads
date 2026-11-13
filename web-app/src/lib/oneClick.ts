// Talks to NEAR Intents' 1Click API (https://docs.near-intents.org) from the server. Used by
// /api/intents (the top-up card) and by the TOPUP text command. 1Click works without a key (it then
// keeps 0.2% of each swap); set ONECLICK_API_KEY to use one.

import "server-only";
import { type TopUpAsset, type TopUpQuote, type TopUpStatus, WNEAR_CONTRACT } from "@/lib/intents";

const ONECLICK = "https://1click.chaindefuser.com/v0";
const SLIPPAGE_BPS = 100; // 1%
const DEADLINE_MINUTES = 30;

/** 1Click turned the request down. `message` is 1Click's own, e.g. "refundTo is not valid". */
export class OneClickError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function headers(): HeadersInit {
  const key = process.env.ONECLICK_API_KEY;
  return { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}) };
}

async function oneClickError(res: Response): Promise<OneClickError> {
  const json = await res.json().catch(() => ({}));
  const message = typeof json.message === "string" ? json.message : "NEAR Intents couldn't answer. Try again.";
  return new OneClickError(message, res.status);
}

/**
 * A quote for swapping `amount` (in the asset's smallest unit) of `asset` into wNEAR for
 * `recipient`. A dry quote is only a price; a real one has a deposit address. A refund goes back
 * on the coin's own chain to `refundTo`, or with `refundType: "INTENTS"` to that NEAR account's
 * balance on NEAR Intents.
 */
export async function requestQuote(args: {
  asset: TopUpAsset;
  amount: string;
  recipient: string;
  refundTo: string;
  refundType?: "ORIGIN_CHAIN" | "INTENTS";
  dry: boolean;
}): Promise<TopUpQuote> {
  const res = await fetch(`${ONECLICK}/quote`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      dry: args.dry,
      swapType: "EXACT_INPUT",
      slippageTolerance: SLIPPAGE_BPS,
      originAsset: args.asset.id,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: `nep141:${WNEAR_CONTRACT}`,
      amount: args.amount,
      refundTo: args.refundTo,
      refundType: args.refundType ?? "ORIGIN_CHAIN",
      recipient: args.recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + DEADLINE_MINUTES * 60_000).toISOString(),
    }),
  });
  if (!res.ok) throw await oneClickError(res);
  const { quote } = await res.json();
  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    minAmountOut: quote.minAmountOut,
    amountInUsd: quote.amountInUsd,
    timeEstimate: quote.timeEstimate,
    depositAddress: quote.depositAddress,
    deadline: quote.deadline,
  };
}

/** How the top-up with this deposit address is going. */
export async function topUpStatus(depositAddress: string): Promise<TopUpStatus> {
  const res = await fetch(`${ONECLICK}/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw await oneClickError(res);
  return (await res.json()).status;
}
