// Set these in .env.local (see .env.example). NEXT_PUBLIC_* values are inlined at build time.

export type Network = "testnet" | "mainnet";

export const NETWORK: Network = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

/** The $CTO token contract, e.g. cto.you.testnet. Also the parent of every CTOad account. */
export const TOKEN_CONTRACT = process.env.NEXT_PUBLIC_TOKEN_CONTRACT ?? "";

/** The CTOad NFT contract, e.g. ctoads.you.testnet. */
export const NFT_CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT ?? "";

/**
 * NEAR RPC endpoints, tried in order: when one is rate limited or down, requests move on to the
 * next. They're run by different companies (FastNEAR, dRPC, Intear), so one limit can't stop the
 * site. NEXT_PUBLIC_RPC_URL (one URL, or several separated by commas) goes first.
 */
const DEFAULT_RPC_URLS =
  NETWORK === "mainnet"
    ? ["https://free.rpc.fastnear.com", "https://near.drpc.org", "https://rpc.intea.rs"]
    : ["https://test.rpc.fastnear.com", "https://near-testnet.drpc.org", "https://testnet-rpc.intea.rs"];
const CUSTOM_RPC_URLS = (process.env.NEXT_PUBLIC_RPC_URL ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
export const RPC_URLS = [...new Set([...CUSTOM_RPC_URLS, ...DEFAULT_RPC_URLS])];

export const EXPLORER_URL = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

/** The number alerts are texted from, a msgbubbles number in international format. Empty if alerts can't be sent. */
export const MSGBUBBLES_NUMBER = process.env.NEXT_PUBLIC_MSGBUBBLES_NUMBER ?? "";

export const CONFIGURED = Boolean(TOKEN_CONTRACT && NFT_CONTRACT);

/** Slippage allowed between the quote and the trade landing on-chain. */
export const SLIPPAGE_BPS = 200n; // 2%
