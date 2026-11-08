"use client";

import Link from "next/link";

import { AccountLink } from "@/components/AccountLink";
import { CtoadImage, CtoadTraits } from "@/components/CtoadImage";
import { useCtoad, useCtoadFunds, useHolder, useSellQuote } from "@/hooks/useCto";
import { ctoadAccountId, ctoadExtra } from "@/lib/cto";
import { formatCto, formatNear } from "@/lib/near";

/** One CTOad: its image, traits, holder, and its backpack, the account it owns. */
export function CtoadPage({ id }: { id: string }) {
  const valid = /^[1-9]\d*$/.test(id);
  const { data: token, isLoading } = useCtoad(valid ? id : null);

  if (!valid || (!isLoading && token === null)) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-3xl font-bold">No CTOad #{id}</h1>
        <p className="mt-2 text-white/60">It hasn&apos;t been minted.</p>
        <Link href="/ctoads" className="mt-6 inline-block text-frog hover:underline">
          ← All CTOads
        </Link>
      </div>
    );
  }

  const extra = token ? ctoadExtra(token) : {};
  return (
    <div className="space-y-6">
      <Link href="/ctoads" className="text-sm text-white/50 hover:text-white">
        ← All CTOads
      </Link>
      <div className="grid gap-8 md:grid-cols-[minmax(0,420px)_1fr]">
        <CtoadImage token={token ?? undefined} className="aspect-square w-full rounded-2xl" />
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">CTOad #{id}</h1>
            {extra.loss && <p className="mt-1 text-rekt">Lost {formatNear(extra.loss, 2)} NEAR</p>}
            {token && (
              <p className="mt-1 text-sm text-white/60">
                Held by <AccountLink id={token.owner_id} keep={16} />
              </p>
            )}
          </div>
          {token && <CtoadTraits token={token} className="w-fit text-sm" />}
          {token && <Backpack id={id} />}
        </div>
      </div>
    </div>
  );
}

/** What the CTOad's own account holds. Its holder controls it, and it moves with the CTOad. */
function Backpack({ id }: { id: string }) {
  const account = ctoadAccountId(id);
  const { data: funds } = useCtoadFunds(id);
  const { data: bag } = useHolder(account);
  const balance = bag ? BigInt(bag.balance) : 0n;
  const { data: worth } = useSellQuote(balance > 0n ? account : null, balance);
  const unswept = funds ? BigInt(funds.account.unswept_fees) : 0n;

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5">
      <h2 className="font-semibold">Backpack</h2>
      <p className="mt-1 text-sm text-white/60">
        This CTOad&apos;s own account, <AccountLink id={account} keep={24} />. Whoever holds the CTOad controls it, and
        selling the CTOad hands over everything in it.
      </p>
      {funds?.account.state !== "Ready" && funds && (
        <p className="mt-4 text-sm text-amber-300">This CTOad has no account yet.</p>
      )}
      <dl className="mt-4 space-y-1 text-sm">
        <Row label="NEAR" value={funds ? `${formatNear(funds.inAccount)} NEAR` : "…"} />
        {unswept > 0n && <Row label="Fees not swept in yet" value={`${formatNear(unswept)} NEAR`} />}
        <Row
          label="$CTO"
          value={bag ? `${formatCto(balance)} $CTO` : "…"}
          note={worth ? `worth about ${formatNear(worth.near_out)} NEAR` : undefined}
        />
      </dl>
    </section>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right">
        {value}
        {note && <span className="block text-xs text-white/40">{note}</span>}
      </dd>
    </div>
  );
}
