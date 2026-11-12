// Typed access to the $CTO token and CTOad NFT contracts. Field names match the Rust view types
// in contracts/cto-token/src/lib.rs and contracts/ctoad-nft/src/lib.rs.

import { NFT_CONTRACT, SLIPPAGE_BPS, TOKEN_CONTRACT } from "@/config";
import { availableBalance, formatNear, view, viewAccount } from "@/lib/near";

export type Market = {
  real_near_reserve: string;
  virtual_near_reserve: string;
  token_reserve: string;
  circulating_supply: string;
  /** yoctoNEAR per whole $CTO */
  price_per_token: string;
  ctoads_minted: number;
  ctoads_reserved: number;
  max_ctoads: number;
  takeover: boolean;
  deployer_fees_unwithdrawn: string;
  deployer_fees_total: string;
  holder_fees_total: string;
  fees_per_ctoad: string;
  /** NEAR the treasury holds now, and has received in total. */
  treasury_balance: string;
  treasury_total: string;
};

export type TokenConfig = {
  owner_id: string;
  ctoad_contract_id: string;
  fee_bps: number;
  loss_threshold: string;
  max_ctoads: number;
  one_per_wallet: boolean;
  min_hold_secs: number;
  ctoad_account_code_hash: string;
  ctoad_account_deposit: string;
};

export type Holder = {
  balance: string;
  cost_basis: string;
  last_buy_ns: string;
  earned_ctoad: boolean;
  failed_mints: number;
};

export type BuyQuote = { tokens_out: string; fee: string; storage_cost: string };
export type SellQuote = { near_out: string; fee: string; loss: string; earns_ctoad: boolean };

export type CtoadAccount = {
  account_id: string;
  state: "Creating" | "Ready" | null;
  unswept_fees: string;
};

export type NftToken = {
  token_id: string;
  owner_id: string;
  metadata: {
    title: string | null;
    description: string | null;
    media: string | null;
    issued_at: string | null;
    extra: string | null;
  } | null;
};

/** One of a CTOad's layers, picked at mint. Matches `Trait` in contracts/ctoad-nft/src/art.rs. */
export type Trait = { category: string; name: string };

export type CtoadExtra = { loss?: string; first_owner?: string; account?: string; traits?: Trait[] };

export type ProposalStatus = "Open" | "Passed" | "Failed" | "Executed";

/** Matches `ProposalView` in contracts/ctoad-nft/src/voting.rs. */
export type Proposal = {
  id: number;
  proposer: string;
  description: string;
  receiver_id: string;
  /** yoctoNEAR to send from the treasury */
  amount: string;
  voting_ends_ms: number;
  yes: number;
  no: number;
  status: ProposalStatus;
};

export const getMarket = () => view<Market>(TOKEN_CONTRACT, "get_market");
export const getConfig = () => view<TokenConfig>(TOKEN_CONTRACT, "get_config");
export const getHolder = (accountId: string) => view<Holder>(TOKEN_CONTRACT, "get_holder", { account_id: accountId });
export const quoteBuy = (accountId: string, nearAmount: bigint) =>
  view<BuyQuote>(TOKEN_CONTRACT, "quote_buy", { account_id: accountId, near_amount: nearAmount.toString() });
export const quoteSell = (accountId: string, amount: bigint) =>
  view<SellQuote>(TOKEN_CONTRACT, "quote_sell", { account_id: accountId, amount: amount.toString() });
export const getCtoadAccount = (tokenId: string) =>
  view<CtoadAccount>(TOKEN_CONTRACT, "get_ctoad_account", { token_id: tokenId });

/** Every art layer's name and weight by category. Matches `ArtView` in contracts/ctoad-nft/src/art.rs. */
export type ArtView = {
  frozen: boolean;
  categories: { category: string; layers: { name: string; weight: number }[] }[];
};
export type Layer = { name: string; svg: string };

/** The order the contract stacks layers in, bottom first: `DRAW_ORDER` in contracts/ctoad-nft/src/art.rs. */
export const DRAW_ORDER = ["Background", "Body", "Mouth", "Eyes", "Outfit", "Headwear", "Item"];

export const getArt = () => view<ArtView>(NFT_CONTRACT, "get_art");
export const getLayer = (category: string, index: number) =>
  view<Layer>(NFT_CONTRACT, "get_layer", { category, index });

export const nftTotalSupply = async () => Number(await view<string>(NFT_CONTRACT, "nft_total_supply"));
export const nftToken = (tokenId: string) => view<NftToken | null>(NFT_CONTRACT, "nft_token", { token_id: tokenId });
export const nftTokensForOwner = (accountId: string) =>
  view<NftToken[]>(NFT_CONTRACT, "nft_tokens_for_owner", { account_id: accountId, from_index: "0", limit: 500 });

/** Every account that holds at least one CTOad, read 100 CTOads at a time. */
export async function ctoadHolders(): Promise<Set<string>> {
  const holders = new Set<string>();
  for (let from = 0; ; from += 100) {
    const page = await view<NftToken[]>(NFT_CONTRACT, "nft_tokens", { from_index: String(from), limit: 100 });
    page.forEach((t) => holders.add(t.owner_id));
    if (page.length < 100) return holders;
  }
}

export const getProposals = (fromId = 1, limit = 50) =>
  view<Proposal[]>(NFT_CONTRACT, "get_proposals", { from_id: fromId, limit });
export const getProposal = (proposalId: number) =>
  view<Proposal>(NFT_CONTRACT, "get_proposal", { proposal_id: proposalId });
export const hasVoted = (proposalId: number, tokenId: string) =>
  view<boolean>(NFT_CONTRACT, "has_voted", { proposal_id: proposalId, token_id: tokenId });

/** CTOad `tokenId`'s own account, e.g. `ctoad-1.cto.near`. It exists once the CTOad is minted. */
export const ctoadAccountId = (tokenId: string) => `ctoad-${tokenId}.${TOKEN_CONTRACT}`;

/** What a holder could claim for one CTOad right now: unswept fees + its account's balance. */
export async function ctoadClaimable(tokenId: string) {
  const account = await getCtoadAccount(tokenId);
  const onChain = account.state === "Ready" ? await viewAccount(account.account_id) : null;
  const inAccount = onChain ? availableBalance(onChain) : 0n;
  return { account, inAccount, total: BigInt(account.unswept_fees) + inAccount };
}

export function ctoadExtra(token: NftToken): CtoadExtra {
  try {
    return JSON.parse(token.metadata?.extra ?? "{}") as CtoadExtra;
  } catch {
    return {};
  }
}

export const withSlippage = (amount: bigint) => (amount * (10_000n - SLIPPAGE_BPS)) / 10_000n;

// Gas and deposits for each transaction. The contracts enforce the minimums.
export const TX = {
  buy: { gas: 30_000_000_000_000n },
  /** A sell that earns a CTOad needs at least 100 Tgas. Sells also require exactly 1 yoctoNEAR. */
  sell: { gas: 150_000_000_000_000n, deposit: 1n },
  /** Up to 20 CTOads per claim. */
  claim: { gas: 300_000_000_000_000n, batch: 20 },
  /** 0.01 NEAR covers the proposal's storage. The contract refunds the rest. */
  propose: { gas: 30_000_000_000_000n, deposit: 10n ** 22n },
  /** Up to 100 CTOads per vote. */
  vote: { gas: 30_000_000_000_000n, batch: 100 },
  execute: { gas: 50_000_000_000_000n },
  /** Moves earned fees into CTOad accounts. Anyone can call it. */
  sweep: { gas: 50_000_000_000_000n },
  /**
   * The NFT contract's `ctoad_call`: 1 yoctoNEAR, and the call's own gas plus room for the hops
   * through the NFT contract, the token contract and the CTOad's account.
   */
  ctoadCall: { extraGas: 50_000_000_000_000n, deposit: 1n },
};

/**
 * Arguments for the NFT contract's `ctoad_call`: makes CTOad `tokenId`'s account call `method` on
 * `receiverId` with `args`, attaching `deposit` yoctoNEAR from the account's own balance.
 */
export function ctoadCallArgs(
  tokenId: string,
  receiverId: string,
  method: string,
  args: object,
  deposit: bigint,
  gas: bigint,
) {
  return {
    token_id: tokenId,
    receiver_id: receiverId,
    method_name: method,
    args: JSON.stringify(args),
    deposit: deposit.toString(),
    gas: gas.toString(),
  };
}

/**
 * Explains why a sell won't earn a CTOad, or returns null if it will. Mirrors the checks in the
 * token contract's `sell`.
 */
export function whyNoCtoad(args: {
  quote: SellQuote;
  config: TokenConfig;
  market: Market;
  holder: Holder;
  nowMs: number;
}): string | null {
  const { quote, config, market, holder, nowMs } = args;
  if (quote.earns_ctoad) return null;
  if (market.ctoads_reserved >= market.max_ctoads) return "All CTOads have been claimed. Minting is closed for good.";
  if (config.one_per_wallet && holder.earned_ctoad) return "You already earned a CTOad. It's one per wallet.";
  const heldSecs = (nowMs * 1e6 - Number(holder.last_buy_ns)) / 1e9;
  if (heldSecs < config.min_hold_secs) {
    const mins = Math.ceil((config.min_hold_secs - heldSecs) / 60);
    return `Losses only count ${Math.ceil(config.min_hold_secs / 60)} min after your last buy. Wait about ${mins} more min.`;
  }
  if (BigInt(quote.loss) === 0n) return "This sell isn't at a loss.";
  return `This sell loses ${formatNear(quote.loss)} NEAR. A single sell has to lose at least ${formatNear(
    config.loss_threshold,
  )} NEAR to earn a CTOad.`;
}
