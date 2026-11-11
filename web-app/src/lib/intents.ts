// Topping up from another chain with NEAR Intents (1Click, https://docs.near-intents.org). Someone
// sends USDC, ETH, SOL or BTC to a one-time deposit address; 1Click swaps it and delivers wNEAR to
// their NEAR account. The trade card then unwraps the wNEAR and buys $CTO in one wallet request.
// Shared by the browser and /api/intents.

/** What a top-up can start from. `id` is 1Click's asset ID. */
export type TopUpAsset = { id: string; symbol: string; chain: string; decimals: number; kind: "evm" | "sol" | "btc" };

export const TOPUP_ASSETS: TopUpAsset[] = [
  { id: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", symbol: "USDC", chain: "Base", decimals: 6, kind: "evm" },
  { id: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", symbol: "USDC", chain: "Ethereum", decimals: 6, kind: "evm" },
  { id: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", symbol: "USDC", chain: "Arbitrum", decimals: 6, kind: "evm" },
  { id: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", symbol: "USDC", chain: "Solana", decimals: 6, kind: "sol" },
  { id: "nep141:eth.omft.near", symbol: "ETH", chain: "Ethereum", decimals: 18, kind: "evm" },
  { id: "nep141:sol.omft.near", symbol: "SOL", chain: "Solana", decimals: 9, kind: "sol" },
  { id: "nep141:btc.omft.near", symbol: "BTC", chain: "Bitcoin", decimals: 8, kind: "btc" },
];

/** 1Click delivers wrapped NEAR. The trade card unwraps it before buying. */
export const WNEAR_CONTRACT = "wrap.near";

/** wrap.near's one-time storage fee, needed before it can hold someone's wNEAR. */
export const WNEAR_STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR

/** A quote as /api/intents returns it. `depositAddress` is only there for a real (not dry) quote. */
export type TopUpQuote = {
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  amountInUsd?: string;
  timeEstimate: number;
  depositAddress?: string;
  deadline?: string;
};

/** Where a top-up is. SUCCESS means the wNEAR has arrived. */
export type TopUpStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export const STATUS_TEXT: Record<TopUpStatus, string> = {
  PENDING_DEPOSIT: "Waiting for your deposit…",
  KNOWN_DEPOSIT_TX: "Deposit seen. Waiting for it to confirm…",
  INCOMPLETE_DEPOSIT: "Less than the quoted amount arrived. It will be refunded.",
  PROCESSING: "Swapping to NEAR…",
  SUCCESS: "Your NEAR has arrived.",
  REFUNDED: "The swap didn't go through. Your deposit was refunded to your refund address.",
  FAILED: "The swap failed. Contact NEAR Intents support with your deposit address.",
};

/** Calls /api/intents from the browser and returns its JSON, or throws its error message. */
export async function intentsApi<T>(method: string, init?: { query?: string; body?: object }): Promise<T> {
  const res = await fetch(`/api/intents${init?.query ?? ""}`, {
    method,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}
