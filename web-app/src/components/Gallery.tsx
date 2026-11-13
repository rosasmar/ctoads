"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { CONFIGURED, EXPLORER_URL } from "@/config";
import { CtoadImage, CtoadTraits } from "@/components/CtoadImage";
import { HolderName } from "@/components/HolderName";
import { useCtoad, useMarket, useOwnedCtoads } from "@/hooks/useCto";
import { ctoadAccountId, ctoadExtra, nftTotalSupply, type NftToken } from "@/lib/cto";
import { formatNear } from "@/lib/near";

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
  // Compact cards show only the picture, number and loss; Details adds traits, holder and account.
  const [details, setDetails] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">CTOads</h1>
        <p className="mt-1 text-ink/65">
          {total ?? "…"} of {max} minted. Each one was earned by losing NEAR on a single $CTO sell.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {signedAccountId && (
          <Toggle options={[["All", view === "all"], ["Mine", view === "mine"]]} onPick={(i) => setView(i === 0 ? "all" : "mine")} />
        )}
        <Toggle options={[["Compact", !details], ["Details", details]]} onPick={(i) => setDetails(i === 1)} />
      </div>
      {error && <p className="text-rekt">Couldn&apos;t load CTOads: {String(error.message ?? error)}</p>}
      {mine && owned?.length === 0 && (
        <p className="rounded-xl bg-ink/5 p-6 text-center text-ink/65">No CTOads in this wallet yet.</p>
      )}
      {!mine && total === 0 && (
        <p className="rounded-xl bg-ink/5 p-6 text-center text-ink/65">No CTOads yet. Somebody has to get rekt first.</p>
      )}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
        {mine
          ? owned?.map((t) => <CtoadCard key={t.token_id} id={t.token_id} token={t} details={details} />)
          : ids.map((id) => <GalleryCard key={id} id={id} details={details} />)}
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

/** A row of buttons where one is picked, like All / Mine. */
function Toggle({ options, onPick }: { options: [label: string, picked: boolean][]; onPick: (index: number) => void }) {
  return (
    <div className="flex w-fit gap-1 rounded-xl bg-ink/5 p-1 text-sm">
      {options.map(([label, picked], i) => (
        <button
          key={label}
          onClick={() => onPick(i)}
          className={`rounded-lg px-4 py-1.5 ${picked ? "bg-ink/10 font-medium" : "text-ink/65"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function GalleryCard({ id, details }: { id: string; details: boolean }) {
  const { data: token } = useCtoad(id);
  return <CtoadCard id={id} token={token ?? undefined} details={details} />;
}

/** `token` is undefined while it loads. */
function CtoadCard({ id, token: t, details }: { id: string; token?: NftToken; details: boolean }) {
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
        {details && (
          <>
            {t && <CtoadTraits token={t} className="py-1" />}
            {t && (
              <p className="text-ink/65">
                Held by <HolderName accountId={t.owner_id} keep={8} />
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
          </>
        )}
      </div>
    </div>
  );
}
