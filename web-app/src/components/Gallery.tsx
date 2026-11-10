"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { CONFIGURED, EXPLORER_URL } from "@/config";
import { CtoadImage, CtoadTraits } from "@/components/CtoadImage";
import { useCtoad, useMarket, useOwnedCtoads } from "@/hooks/useCto";
import { ctoadAccountId, ctoadExtra, nftTotalSupply, type NftToken } from "@/lib/cto";
import { formatNear, shortAccount } from "@/lib/near";

/** CTOads shown at first, and added by each "Show more". Every CTOad carries its whole image. */
const PAGE = 20;

export function Gallery() {
  // Only the count refreshes. Each card loads its own CTOad once.
  const { data: total, error } = useSWR(CONFIGURED ? "ctoadCount" : null, nftTotalSupply, { refreshInterval: 15_000 });
  const [shown, setShown] = useState(PAGE);
  // Newest first, so fresh mints are at the top.
  const ids = total ? Array.from({ length: Math.min(shown, total) }, (_, i) => String(total - i)) : [];
  const { data: market } = useMarket();
  const max = market?.max_ctoads ?? 500;
  const { signedAccountId } = useWalletSelector();
  const [view, setView] = useState<"all" | "mine">("all");
  const mine = view === "mine" && !!signedAccountId;
  const { data: owned } = useOwnedCtoads(mine ? signedAccountId : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">CTOads</h1>
        <p className="mt-1 text-ink/65">
          {total ?? "…"} of {max} minted. Each one was earned by losing NEAR on a single $CTO sell.
        </p>
      </div>
      {signedAccountId && (
        <div className="flex w-fit gap-1 rounded-xl bg-ink/5 p-1 text-sm">
          {(["all", "mine"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-4 py-1.5 ${view === v ? "bg-ink/10 font-medium" : "text-ink/65"}`}
            >
              {v === "all" ? "All" : "Mine"}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-rekt">Couldn&apos;t load CTOads: {String(error.message ?? error)}</p>}
      {mine && owned?.length === 0 && (
        <p className="rounded-xl bg-ink/5 p-6 text-center text-ink/65">No CTOads in this wallet yet.</p>
      )}
      {!mine && total === 0 && (
        <p className="rounded-xl bg-ink/5 p-6 text-center text-ink/65">No CTOads yet. Somebody has to get rekt first.</p>
      )}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
        {mine
          ? owned?.map((t) => <CtoadCard key={t.token_id} id={t.token_id} token={t} />)
          : ids.map((id) => <GalleryCard key={id} id={id} />)}
      </div>
      {!mine && total !== undefined && shown < total && (
        <div className="text-center">
          <button onClick={() => setShown(shown + PAGE)} className="rounded-xl press bg-card px-5 py-2 text-sm">
            Show more
          </button>
        </div>
      )}
    </div>
  );
}

function GalleryCard({ id }: { id: string }) {
  const { data: token } = useCtoad(id);
  return <CtoadCard id={id} token={token ?? undefined} />;
}

/** `token` is undefined while it loads. */
function CtoadCard({ id, token: t }: { id: string; token?: NftToken }) {
  const extra = t ? ctoadExtra(t) : {};
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-ink bg-card shadow-hard">
      <Link href={`/ctoads/${id}`}>
        <CtoadImage token={t} className="aspect-square w-full border-b-2 border-ink" />
      </Link>
      <div className="space-y-0.5 p-3 text-xs">
        <Link href={`/ctoads/${id}`} className="block font-mono text-sm font-bold hover:text-frog">
          CTOad #{id}
        </Link>
        {extra.loss && <p className="font-mono font-bold text-rekt">Lost {formatNear(extra.loss, 2)} NEAR</p>}
        {t && <CtoadTraits token={t} className="py-1" />}
        {t && (
          <p className="text-ink/65">
            Held by <span className="font-mono">{shortAccount(t.owner_id, 8)}</span>
          </p>
        )}
        <a
          href={`${EXPLORER_URL}/address/${ctoadAccountId(id)}`}
          target="_blank"
          rel="noreferrer"
          className="text-frog hover:underline"
        >
          Its account ↗
        </a>
      </div>
    </div>
  );
}
