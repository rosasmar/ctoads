"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { TOKEN_CONTRACT } from "@/config";
import { nftToken, nftTokensForOwner } from "@/lib/cto";
import { formatNear } from "@/lib/near";
import { CtoadImage } from "@/components/CtoadImage";

/** `sinceMs`: only CTOads issued after this time count, so an older CTOad isn't mistaken for the new one. */
export type MintMoment = { accountId: string; tokenId: string | null; loss: string; sinceMs: number };

/** "You got rekt, here's your CTOad." Shown after a sell that earned one. */
export function MintModal({ moment, onClose }: { moment: MintMoment; onClose: () => void }) {
  const [tokenId, setTokenId] = useState(moment.tokenId);
  const { data: token } = useSWR(tokenId ? ["ctoad", tokenId] : null, ([, id]) => nftToken(id));

  // The mint lands a block or two after the sell. If the transaction didn't include it, poll for it.
  useEffect(() => {
    if (tokenId) return;
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 20 && !cancelled; i++) {
        const tokens = await nftTokensForOwner(moment.accountId).catch(() => []);
        const newest = tokens
          .filter((t) => Number(t.metadata?.issued_at ?? 0) >= moment.sinceMs)
          .map((t) => Number(t.token_id))
          .sort((a, b) => b - a)[0];
        if (newest) {
          setTokenId(String(newest));
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [tokenId, moment.accountId, moment.sinceMs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-rekt/40 bg-panel p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm uppercase tracking-widest text-rekt">You got rekt</p>
        <h2 className="mt-1 text-2xl font-bold">Here&apos;s your CTOad{tokenId ? ` #${tokenId}` : ""}</h2>
        <div className="mx-auto my-5 aspect-square w-48 overflow-hidden rounded-xl">
          {tokenId ? (
            <CtoadImage token={token ?? undefined} className="h-full w-full" />
          ) : (
            <div className="flex h-full w-full animate-pulse items-center justify-center bg-white/5 text-sm text-white/50">
              Minting…
            </div>
          )}
        </div>
        <p className="text-sm text-white/70">
          You lost <span className="font-semibold text-rekt">{formatNear(moment.loss)} NEAR</span> on that sell.
          {tokenId && (
            <>
              {" "}
              Once all CTOads are minted, this one&apos;s share of every fee collects in{" "}
              <span className="font-mono text-white">ctoad-{tokenId}.{TOKEN_CONTRACT}</span>.
            </>
          )}
        </p>
        <div className="mt-6 flex justify-center gap-3 text-sm">
          <Link href="/claim" className="rounded-lg bg-frog px-4 py-2 font-medium text-black" onClick={onClose}>
            My CTOads
          </Link>
          <button onClick={onClose} className="rounded-lg border border-white/20 px-4 py-2">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
