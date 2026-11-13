"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { nftTokensForOwner } from "@/lib/cto";
import { useCtoad } from "@/hooks/useCto";
import { formatNear } from "@/lib/near";
import { CtoadImage } from "@/components/CtoadImage";

/** `sinceMs`: only CTOads issued after this time count, so an older CTOad isn't mistaken for the new one. */
/** `loss` and `nearOut` come from the sell event, in yoctoNEAR. */
export type MintMoment = { accountId: string; tokenId: string | null; loss: string; nearOut: string; sinceMs: number };

/** "You got rekt, here's your CTOad": a receipt of the loss, stamped REKT. Shown after a sell that earned one. */
export function MintModal({ moment, onClose }: { moment: MintMoment; onClose: () => void }) {
  const [tokenId, setTokenId] = useState(moment.tokenId);
  const { data: token } = useCtoad(tokenId);

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

  const paid = BigInt(moment.nearOut) + BigInt(moment.loss);

  // The receipt prints, REKT stamps it, then the CTOad pops in. The timing is in globals.css (.mint-*).
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="You minted a CTOad"
        className="shadow-window w-full max-w-2xl border border-ink bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink bg-card px-3 py-1.5 font-mono text-xs">
          <span>you_got_rekt.exe</span>
          <button onClick={onClose} aria-label="Close" className="px-1 text-base leading-none hover:text-rekt">
            ×
          </button>
        </div>
        <div className="space-y-6 p-6">
          <div className="flex flex-col items-center gap-8 sm:flex-row">
            <div className="relative w-full flex-1 space-y-2 border-2 border-ink bg-card p-4 pb-16 font-mono text-sm shadow-hard">
              <p className="mint-line flex justify-between border-b-2 border-dashed border-ink pb-2 font-bold" style={{ animationDelay: ".1s" }}>
                <span>SELL RECEIPT</span>
                <span>$CTO</span>
              </p>
              <p className="mint-line flex justify-between" style={{ animationDelay: ".35s" }}>
                <span>paid</span>
                <span>{formatNear(paid)} NEAR</span>
              </p>
              <p className="mint-line flex justify-between" style={{ animationDelay: ".6s" }}>
                <span>got back</span>
                <span>{formatNear(moment.nearOut)} NEAR</span>
              </p>
              <p className="mint-line flex justify-between border-t-2 border-ink pt-2 font-bold text-rekt" style={{ animationDelay: ".85s" }}>
                <span>LOSS</span>
                <span>−{formatNear(moment.loss)} NEAR</span>
              </p>
              <span className="mint-stamp font-display absolute right-6 bottom-3 border-4 border-rekt bg-white/85 px-3 text-4xl text-rekt">
                REKT
              </span>
            </div>
            <div className="mint-pop aspect-square w-56 shrink-0 overflow-hidden rounded-2xl border-4 border-ink bg-card shadow-hard">
              {tokenId ? (
                <CtoadImage token={token ?? undefined} className="h-full w-full" />
              ) : (
                <div className="flex h-full w-full animate-pulse items-center justify-center bg-ink/5 font-mono text-sm">
                  Minting…
                </div>
              )}
            </div>
          </div>
          <div className="mint-after flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl leading-none uppercase">
                {tokenId ? `CTOad #${tokenId} is yours.` : "Your CTOad is minting."}
              </h2>
              <p className="mt-2 text-ink/80">Welcome to the club. Membership cost you a loss.</p>
            </div>
            <div className="flex gap-3">
              {tokenId && (
                <Link
                  href={`/ctoads/${tokenId}`}
                  className="press rounded-xl bg-ink px-4 py-2 font-bold text-white"
                  onClick={onClose}
                >
                  See your CTOad
                </Link>
              )}
              <button onClick={onClose} className="press rounded-xl bg-card px-4 py-2 font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
