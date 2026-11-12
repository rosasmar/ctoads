"use client";

import Link from "next/link";

import { CtoadImage, ToadPreview } from "@/components/CtoadImage";
import { HolderName } from "@/components/HolderName";
import { useCtoad } from "@/hooks/useCto";
import { ctoadExtra, type Market, type TokenConfig } from "@/lib/cto";
import { formatNear } from "@/lib/near";

// The home page's sections around the trade card: the ticker, the first screen, the progress to the
// takeover, how it works and the newest CTOads. Every number comes from the contracts.

export function Ticker({ market, config }: { market?: Market; config?: TokenConfig }) {
  if (!market || !config) return <div className="h-9 rounded-xl border-2 border-ink bg-ink" />;
  const items = [
    `FEE ${config.fee_bps / 100}%`,
    `LOSE ${formatNear(config.loss_threshold)} NEAR TO MINT`,
    `${market.ctoads_minted}/${market.max_ctoads} CTOADS MINTED`,
    `1 $CTO = ${formatNear(market.price_per_token)} NEAR`,
    market.takeover ? "TAKEOVER: LIVE" : "TAKEOVER: NOT YET",
    "NOT FINANCIAL ADVICE",
  ];
  const line = items.join(" ··· ") + " ··· ";
  return (
    <div className="overflow-hidden whitespace-nowrap rounded-xl border-2 border-ink bg-ink py-2 font-mono text-xs font-bold text-accent">
      {/* Two copies side by side, so the scroll loops without a gap. Screen readers get one. */}
      <span className="ticker inline-block">
        {line}
        <span aria-hidden="true">{line}</span>
      </span>
    </div>
  );
}

export function Hero({ market, config }: { market?: Market; config?: TokenConfig }) {
  const max = market?.max_ctoads ?? 500;
  const loss = config ? formatNear(config.loss_threshold) : "1";
  return (
    <section className="grid items-center gap-12 md:grid-cols-[1fr_auto]">
      <div className="space-y-6">
        <p className="w-fit -rotate-2 border-2 border-ink bg-rekt px-3 py-1 font-mono text-xs font-bold text-white">
          MEMBERS ONLY. MEMBERSHIP COSTS A LOSS.
        </p>
        <h1 className="text-5xl leading-[0.95] uppercase md:text-7xl">
          Sell at a loss.
          <br />
          Get a toad.
        </h1>
        <p className="max-w-xl text-lg text-ink/80">
          Lose {loss} NEAR or more on a single $CTO sell and you mint one of {max} CTOads. When the last one is minted,
          the bagholders take over: CTOad holders split the trading fees.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a href="#trade" className="press rounded-xl bg-ink px-6 py-3 font-bold text-white">
            Start losing
          </a>
          <a href="#how" className="px-1 py-3 font-bold underline underline-offset-4">
            How it works ↓
          </a>
        </div>
      </div>
      <NewestCtoad minted={market?.ctoads_minted ?? 0} />
    </section>
  );
}

/**
 * The newest CTOad, tilted, with a REKT sticker and the receipt of the loss that minted it. Before
 * the first mint, random looks from the art instead.
 */
function NewestCtoad({ minted }: { minted: number }) {
  const { data: token } = useCtoad(minted > 0 ? String(minted) : null);
  const loss = token ? ctoadExtra(token).loss : undefined;
  return (
    <div className="relative mx-auto mb-10 w-64 md:mr-4 md:w-80">
      <div className="rotate-3 overflow-hidden rounded-2xl border-4 border-ink shadow-hard">
        {minted > 0 ? (
          <CtoadImage token={token ?? undefined} className="aspect-square w-full" />
        ) : (
          <ToadPreview className="aspect-square w-full text-6xl" />
        )}
      </div>
      <span className="font-display absolute -top-5 -right-4 rotate-12 border-4 border-ink bg-rekt px-4 py-1 text-2xl text-white">
        REKT
      </span>
      {minted === 0 && (
        <p className="absolute -bottom-8 -left-6 w-56 -rotate-3 border-2 border-ink bg-card p-3 font-mono text-xs font-bold shadow-hard">
          PREVIEW: RANDOM LOOKS FROM THE ART ON-CHAIN. NONE MINTED YET.
        </p>
      )}
      {minted > 0 && (
        <div className="absolute -bottom-10 -left-6 w-56 -rotate-3 space-y-1 border-2 border-ink bg-card p-3 font-mono text-xs shadow-hard">
          <p className="flex justify-between border-b-2 border-dashed border-ink pb-1 font-bold">
            <span>MINT RECEIPT</span>
            <span>#{minted}</span>
          </p>
          {token && (
            <p className="flex justify-between">
              <span>held by</span>
              <HolderName accountId={token.owner_id} keep={6} className="font-bold underline" />
            </p>
          )}
          <p className="flex justify-between font-bold text-rekt">
            <span>LOSS</span>
            <span>{loss ? `−${formatNear(loss, 2)} NEAR` : "…"}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function Progress({ market }: { market?: Market }) {
  const minted = market?.ctoads_minted ?? 0;
  const max = market?.max_ctoads ?? 500;
  const pct = Math.min(100, (minted / max) * 100);
  return (
    <section className="flex flex-wrap overflow-hidden rounded-2xl border-2 border-ink bg-card shadow-hard">
      <div className="flex-[1_1_160px] border-r-2 border-ink px-5 py-4">
        <p className="font-mono text-xs font-bold">MINTED</p>
        <p className="font-display text-4xl">
          {minted}/{max}
        </p>
      </div>
      <div className="flex flex-[3_1_280px] flex-col justify-center gap-2 px-5 py-4">
        <p className="font-mono text-xs font-bold">PROGRESS TO TAKEOVER</p>
        <div className="h-6 overflow-hidden rounded-md border-2 border-ink bg-ink/5">
          <div className="stripes h-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="flex flex-[1_1_220px] items-center border-l-2 border-ink bg-ink px-5 py-4 font-bold text-accent">
        {market?.takeover
          ? "Takeover is live. Fees go to the holders."
          : `Until all ${max} are minted, fees go to the deployer.`}
      </p>
    </section>
  );
}

export function HowItWorks({ config }: { config?: TokenConfig }) {
  const loss = config ? formatNear(config.loss_threshold) : "1";
  const max = config?.max_ctoads ?? 500;
  const fee = config ? config.fee_bps / 100 : 1;
  const steps = [
    ["Buy $CTO", `Every buy and sell on the curve pays a ${fee}% fee. The contract records what you spent.`],
    ["Sell at a loss", `If one sell loses ${loss} NEAR or more against what you paid, you mint the next CTOad.`],
    ["The takeover", `When CTOad #${max} mints, the deployer's cut ends. From then on, the fees go to the holders.`],
    ["Claim", "Each CTOad has its own account where its fees collect. Whoever holds the CTOad claims them."],
  ];
  const colors = ["text-[#3dbe5a]", "text-rekt", "text-[#5bc0f8]", "text-[#ff8fc7]"];
  return (
    <section id="how" className="overflow-hidden rounded-2xl border-2 border-ink bg-card shadow-hard">
      {steps.map(([title, body], i) => (
        <div key={title} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b-2 border-ink px-5 py-4 last:border-b-0">
          <span className={`font-display w-14 text-3xl [-webkit-text-stroke:2px_#111] ${colors[i]}`}>0{i + 1}</span>
          <h3 className="w-48 text-lg font-bold">{title}</h3>
          <p className="flex-[1_1_320px] text-ink/80">{body}</p>
        </div>
      ))}
    </section>
  );
}

/** The four newest CTOads, linking to the gallery. */
export function Bagholders({ minted }: { minted: number }) {
  if (minted === 0) return null;
  const ids = Array.from({ length: Math.min(4, minted) }, (_, i) => String(minted - i));
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-4xl">THE BAGHOLDERS</h2>
        <Link href="/ctoads" className="font-bold underline underline-offset-4">
          See all CTOads →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {ids.map((id) => (
          <BagholderTile key={id} id={id} />
        ))}
      </div>
    </section>
  );
}

function BagholderTile({ id }: { id: string }) {
  const { data: token } = useCtoad(id);
  const loss = token ? ctoadExtra(token).loss : undefined;
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-ink bg-card shadow-hard">
      <Link href={`/ctoads/${id}`}>
        <CtoadImage token={token ?? undefined} className="aspect-square w-full border-b-2 border-ink" />
      </Link>
      <div className="space-y-0.5 px-3 py-2 font-mono text-xs font-bold">
        <p className="flex justify-between gap-2">
          <Link href={`/ctoads/${id}`}>#{id}</Link>
          {loss && <span className="text-rekt">−{formatNear(loss, 2)} NEAR</span>}
        </p>
        {token && <HolderName accountId={token.owner_id} keep={6} className="block truncate underline" />}
      </div>
    </div>
  );
}
