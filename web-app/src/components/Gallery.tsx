"use client";

import { useState } from "react";
import useSWR from "swr";

import { CONFIGURED, EXPLORER_URL, TOKEN_CONTRACT } from "@/config";
import { CtoadImage, CtoadTraits } from "@/components/CtoadImage";
import { useCtoad, useMarket } from "@/hooks/useCto";
import { ctoadExtra, nftTotalSupply } from "@/lib/cto";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">CTOads</h1>
        <p className="mt-1 text-white/60">
          {total ?? "…"} of {max} minted. Each one was earned by losing NEAR on a single $CTO sell.
        </p>
      </div>
      {error && <p className="text-rekt">Couldn&apos;t load CTOads: {String(error.message ?? error)}</p>}
      {total === 0 && (
        <p className="rounded-xl bg-white/5 p-6 text-center text-white/60">No CTOads yet. Somebody has to get rekt first.</p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {ids.map((id) => (
          <GalleryCard key={id} id={id} />
        ))}
      </div>
      {total !== undefined && shown < total && (
        <div className="text-center">
          <button onClick={() => setShown(shown + PAGE)} className="rounded-xl border border-white/20 px-5 py-2 text-sm">
            Show more
          </button>
        </div>
      )}
    </div>
  );
}

function GalleryCard({ id }: { id: string }) {
  const { data: t } = useCtoad(id);
  const extra = t ? ctoadExtra(t) : {};
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-panel">
      <CtoadImage token={t ?? undefined} className="aspect-square w-full" />
      <div className="space-y-0.5 p-3 text-xs">
        <p className="text-sm font-semibold">CTOad #{id}</p>
        {extra.loss && <p className="text-rekt">Lost {formatNear(extra.loss, 2)} NEAR</p>}
        {t && <CtoadTraits token={t} className="py-1" />}
        {t && (
          <p className="text-white/50">
            Held by <span className="font-mono">{shortAccount(t.owner_id, 8)}</span>
          </p>
        )}
        <a
          href={`${EXPLORER_URL}/address/ctoad-${id}.${TOKEN_CONTRACT}`}
          target="_blank"
          rel="noreferrer"
          className="text-frog/80 hover:text-frog"
        >
          Its account ↗
        </a>
      </div>
    </div>
  );
}
