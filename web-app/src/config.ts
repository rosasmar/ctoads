// Set these in .env.local (see .env.example). NEXT_PUBLIC_* values are inlined at build time.

export type Network = "testnet" | "mainnet";

export const NETWORK: Network = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

/** The $CTO token contract, e.g. cto.you.testnet. Also the parent of every CTOad account. */
export const TOKEN_CONTRACT = process.env.NEXT_PUBLIC_TOKEN_CONTRACT ?? "";

/** The CTOad NFT contract, e.g. ctoads.you.testnet. */
export const NFT_CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT ?? "";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");

export const EXPLORER_URL = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

/** The number alerts are texted from, a msgbubbles number in international format. Empty if alerts can't be sent. */
export const MSGBUBBLES_NUMBER = process.env.NEXT_PUBLIC_MSGBUBBLES_NUMBER ?? "";

export const CONFIGURED = Boolean(TOKEN_CONTRACT && NFT_CONTRACT);

/** Slippage allowed between the quote and the trade landing on-chain. */
export const SLIPPAGE_BPS = 200n; // 2%
