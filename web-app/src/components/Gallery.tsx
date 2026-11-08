"use client";

import useSWR from "swr";

import { CONFIGURED, EXPLORER_URL, TOKEN_CONTRACT } from "@/config";
import { CtoadImage } from "@/components/CtoadImage";
import { useMarket } from "@/hooks/useCto";
import { ctoadExtra, nftTokens, nftTotalSupply, type NftToken } from "@/lib/cto";
import { formatNear, shortAccount } from "@/lib/near";

const PAGE = 50;

async function allCtoads(): Promise<NftToken[]> {
  const total = await nftTotalSupply();
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => nftTokens(i * PAGE, PAGE)),
  );
  return pages.flat().sort((a, b) => Number(a.token_id) - Number(b.token_id));
}

export function Gallery() {
  const { data: tokens, error } = useSWR(CONFIGURED ? "gallery" : null, allCtoads, { refreshInterval: 15_000 });
  const { data: market } = useMarket();
  const max = market?.max_ctoads ?? 500;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">CTOads</h1>
        <p className="mt-1 text-white/60">
          {tokens ? tokens.length : "…"} of {max} minted. Each one was earned by losing NEAR on a single $CTO sell.
        </p>
      </div>
      {error && <p className="text-rekt">Couldn&apos;t load CTOads: {String(error.message ?? error)}</p>}
      {tokens && tokens.length === 0 && (
        <p className="rounded-xl bg-white/5 p-6 text-center text-white/60">No CTOads yet. Somebody has to get rekt first.</p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {tokens?.map((t) => {
          const extra = ctoadExtra(t);
          return (
            <div key={t.token_id} className="overflow-hidden rounded-xl border border-white/10 bg-panel">
              <CtoadImage token={t} className="aspect-square w-full" />
              <div className="space-y-0.5 p-3 text-xs">
                <p className="text-sm font-semibold">CTOad #{t.token_id}</p>
                {extra.loss && <p className="text-rekt">Lost {formatNear(extra.loss, 2)} NEAR</p>}
                <p className="text-white/50">
                  Held by <span className="font-mono">{shortAccount(t.owner_id, 8)}</span>
                </p>
                <a
                  href={`${EXPLORER_URL}/address/ctoad-${t.token_id}.${TOKEN_CONTRACT}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-frog/80 hover:text-frog"
                >
                  Its account ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
