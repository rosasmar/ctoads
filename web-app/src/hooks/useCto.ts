"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import { CONFIGURED } from "@/config";
import {
  ctoadClaimable,
  getConfig,
  getHolder,
  getMarket,
  getProposals,
  nftToken,
  nftTokensForOwner,
  quoteBuy,
  quoteSell,
} from "@/lib/cto";

/** Any valid account ID works for previews when nobody is signed in. */
const GUEST = "guest.near";

export function useMarket() {
  return useSWR(CONFIGURED ? "market" : null, getMarket, { refreshInterval: 5_000 });
}

export function useTokenConfig() {
  return useSWR(CONFIGURED ? "config" : null, getConfig, { revalidateOnFocus: false });
}

/** Every proposal, oldest first. Refreshes so votes and closing periods show up on their own. */
export function useProposals() {
  return useSWR(CONFIGURED ? "proposals" : null, () => getProposals(), { refreshInterval: 5_000 });
}

/** One CTOad by its number, with its image and traits. `null` loads nothing. */
export function useCtoad(tokenId: string | null) {
  return useSWR(CONFIGURED && tokenId ? ["ctoad", tokenId] : null, ([, id]) => nftToken(id));
}

/**
 * The NEAR in CTOad `tokenId`'s account, and its fees not yet swept there. Its $CTO is
 * `useHolder(ctoadAccountId(tokenId))`, like any other holder's.
 */
export function useCtoadFunds(tokenId: string | null) {
  return useSWR(CONFIGURED && tokenId ? ["ctoadFunds", tokenId] : null, ([, id]) => ctoadClaimable(id), {
    refreshInterval: 10_000,
  });
}

/** Every CTOad `accountId` holds, lowest number first. */
export function useOwnedCtoads(accountId: string | null) {
  return useSWR(CONFIGURED && accountId ? ["mine", accountId] : null, async ([, id]) =>
    (await nftTokensForOwner(id)).sort((a, b) => Number(a.token_id) - Number(b.token_id)),
  );
}

export function useHolder(accountId: string | null) {
  return useSWR(CONFIGURED && accountId ? ["holder", accountId] : null, ([, id]) => getHolder(id), {
    refreshInterval: 10_000,
  });
}

export function useBuyQuote(accountId: string | null, nearAmount: bigint | null) {
  const amount = useDebounced(nearAmount, 300);
  return useSWR(
    CONFIGURED && amount && amount > 0n ? ["quoteBuy", accountId ?? GUEST, amount.toString()] : null,
    ([, id, amt]) => quoteBuy(id, BigInt(amt)),
    { refreshInterval: 5_000, keepPreviousData: true },
  );
}

export function useSellQuote(accountId: string | null, amount: bigint | null) {
  const debounced = useDebounced(amount, 300);
  return useSWR(
    CONFIGURED && accountId && debounced && debounced > 0n ? ["quoteSell", accountId, debounced.toString()] : null,
    ([, id, amt]) => quoteSell(id, BigInt(amt)),
    { refreshInterval: 5_000, keepPreviousData: true },
  );
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Current time, refreshed every `ms`. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
