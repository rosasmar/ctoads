"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { EXPLORER_URL, NFT_CONTRACT, TOKEN_CONTRACT } from "@/config";
import { CtoadImage } from "@/components/CtoadImage";
import { useMarket, useOwnedCtoads, useTokenConfig } from "@/hooks/useCto";
import { ctoadClaimable, TX } from "@/lib/cto";
import { formatNear } from "@/lib/near";

export function ClaimPage() {
  const { signedAccountId, signIn, callFunction } = useWalletSelector();
  const { data: market } = useMarket();
  const { data: config } = useTokenConfig();
  const { data: tokens } = useOwnedCtoads(signedAccountId);
  const ids = (tokens ?? []).map((t) => t.token_id);
  const { data: claimable, mutate } = useSWR(
    ids.length ? ["claimable", ids.join(",")] : null,
    () => Promise.all(ids.map(async (id) => ({ id, ...(await ctoadClaimable(id)) }))),
    { refreshInterval: 10_000 },
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedAccountId) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-3xl font-bold">Your CTOads</h1>
        <p className="mt-2 text-ink/65">Connect the wallet that holds your CTOads to see and claim their fees.</p>
        <button onClick={() => signIn()} className="mt-6 rounded-xl press bg-accent px-5 py-3 font-semibold text-ink">
          Connect wallet
        </button>
      </div>
    );
  }

  const total = (claimable ?? []).reduce((sum, c) => sum + c.total, 0n);

  const claimAll = async () => {
    setBusy(true);
    setStatus(null);
    try {
      for (let i = 0; i < ids.length; i += TX.claim.batch) {
        await callFunction({
          contractId: NFT_CONTRACT,
          method: "claim",
          args: { token_ids: ids.slice(i, i + TX.claim.batch) },
          gas: TX.claim.gas,
        });
      }
      setStatus("Claimed. Fees are on their way to your wallet.");
      mutate();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = (id: string) =>
    callFunction({
      contractId: TOKEN_CONTRACT,
      method: "create_ctoad_account",
      args: { token_id: id },
      gas: 50_000_000_000_000n,
      deposit: config ? BigInt(config.ctoad_account_deposit) : 0n,
    }).then(() => mutate());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Your CTOads</h1>
          <p className="mt-1 text-ink/65">
            {tokens ? `You hold ${tokens.length}.` : "Loading…"} Each CTOad&apos;s fees collect in its own account, and
            whoever holds it can claim them.
          </p>
        </div>
        {ids.length > 0 && (
          <div className="text-right">
            <p className="text-sm text-ink/65">Claimable now</p>
            <p className="text-2xl font-bold text-frog">{formatNear(total)} NEAR</p>
            <button
              onClick={claimAll}
              disabled={busy || total === 0n}
              className="mt-2 rounded-xl press bg-accent px-5 py-2 font-semibold text-ink disabled:opacity-40"
            >
              {busy ? "Confirm in your wallet…" : "Claim all"}
            </button>
          </div>
        )}
      </div>

      {market && !market.takeover && (
        <p className="rounded-xl bg-ink/5 p-4 text-sm text-ink/80">
          CTOads start earning at the takeover, when all {market.max_ctoads} are minted ({market.ctoads_minted} so far).
          Until then, every fee goes to the deployer.
        </p>
      )}
      {status && <p className="text-sm text-ink/80">{status}</p>}
      {tokens && tokens.length === 0 && (
        <p className="rounded-xl bg-ink/5 p-6 text-center text-ink/65">
          No CTOads in this wallet. Lose at least {config ? formatNear(config.loss_threshold) : "1"} NEAR on a single
          sell to earn one, or buy one from a holder.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {ids.map((id) => {
          const c = claimable?.find((x) => x.id === id);
          return (
            <div key={id} className="flex gap-4 rounded-xl border-2 border-ink bg-card p-3">
              <Link href={`/ctoads/${id}`} className="shrink-0">
                <CtoadImage token={tokens?.find((t) => t.token_id === id)} className="h-20 w-20 rounded-lg" />
              </Link>
              <div className="min-w-0 space-y-1 text-sm">
                <Link href={`/ctoads/${id}`} className="block font-semibold hover:text-frog">
                  CTOad #{id}
                </Link>
                {c ? (
                  <>
                    <p>
                      <span className="text-frog">{formatNear(c.total)} NEAR</span>{" "}
                      <span className="text-ink/65">claimable</span>
                    </p>
                    {c.account.state === "Ready" ? (
                      <a
                        href={`${EXPLORER_URL}/address/${c.account.account_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-mono text-xs text-ink/65 hover:text-ink"
                      >
                        {c.account.account_id} ↗
                      </a>
                    ) : c.account.state === "Creating" ? (
                      <p className="text-xs text-ink/65">Account being created…</p>
                    ) : (
                      <button onClick={() => createAccount(id)} className="text-xs text-ink hover:underline">
                        No account yet. Create it (claims still pay you directly)
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-ink/65">Loading…</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
