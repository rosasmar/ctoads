"use client";

import Link from "next/link";
import { useState } from "react";

import { CtoadImage, ToadPreview } from "@/components/CtoadImage";
import { HolderName } from "@/components/HolderName";
import { ToadHead } from "@/components/ToadHead";
import { MSGBUBBLES_NUMBER } from "@/config";
import { useCtoad } from "@/hooks/useCto";
import { ctoadExtra, type Market, type TokenConfig } from "@/lib/cto";
import { formatNear } from "@/lib/near";

// The home page's sections around the trade card, laid out as a grid of thin-lined cells: the
// ticker, the first screen, the stats, texting, the newest CTOads and how it works. Every number
// comes from the contracts.

export function Ticker({ market, config }: { market?: Market; config?: TokenConfig }) {
  if (!market || !config) return <div className="h-8 border-y border-ink bg-card" />;
  const items = [
    `LOSE ${formatNear(config.loss_threshold)} NEAR TO MINT`,
    `${market.ctoads_minted}/${market.max_ctoads} CTOADS MINTED`,
    `FEE ${config.fee_bps / 100}%`,
    market.takeover ? "TAKEOVER: LIVE" : "TAKEOVER: NOT YET",
    "TEXT YOUR TOAD",
    "NOT FINANCIAL ADVICE",
  ];
  const line = items.join(" ··· ") + " ··· ";
  return (
    <div className="overflow-hidden whitespace-nowrap rounded-lg border border-ink bg-card py-1.5 font-mono text-xs">
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
    // No overflow-hidden here, so a thrown toad head can fly past the edges. The grey cell rounds
    // its own corners instead.
    <section className="grid rounded-xl border border-ink bg-card md:grid-cols-[1.35fr_1fr]">
      <div className="relative space-y-7 border-b border-ink p-6 pb-20 md:border-r md:border-b-0 md:p-8">
        <p className="font-mono text-xs">[ $CTO · MEMBERSHIP COSTS A LOSS ]</p>
        <h1 className="pt-6 text-6xl leading-[1.05] md:text-7xl xl:text-8xl">
          Sell at a loss.
          <br />
          Get a <span className="rounded-lg bg-accent px-2">toad.</span>
        </h1>
        <p className="max-w-lg text-lg">
          Buy <strong>$CTO</strong>, sell it at a {loss} NEAR loss, get one of {max} toads.
          <br />
          <span className="text-ink/65">At #{max}, the toads take over the fees.</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="#trade" className="press bg-ink px-6 py-3 font-medium text-white">
            Start losing
          </a>
          <a href="#text-your-toad" className="press bg-card px-6 py-3 font-medium">
            Text your toad
          </a>
        </div>
        {/* Peeks over the cell's bottom edge: the hidden 40% (42 px) hangs below it. */}
        <ToadHead peek className="absolute right-8 -bottom-[42px] z-20 h-[104px] w-[130px]" />
      </div>
      <div className="flex items-center justify-center rounded-b-[9px] bg-background p-8 md:rounded-r-[9px] md:rounded-bl-none md:p-10">
        <NewestCtoad minted={market?.ctoads_minted ?? 0} />
      </div>
    </section>
  );
}

/** A window frame, like an old desktop app: a title bar, the content, and a caption. No close button, since it can't close. */
export function ToadWindow({
  title,
  caption,
  children,
  className,
}: {
  title: React.ReactNode;
  caption?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line-strong bg-card ${className ?? ""}`}>
      <div className="truncate border-b border-line-strong px-3 py-1.5 font-mono text-xs text-ink/65">{title}</div>
      {children}
      {caption && <div className="border-t border-line-strong px-3 py-2 font-mono text-xs">{caption}</div>}
    </div>
  );
}

/**
 * The newest CTOad in a window, with the loss that minted it. Before the first mint, random looks
 * from the art instead.
 */
function NewestCtoad({ minted }: { minted: number }) {
  const { data: token } = useCtoad(minted > 0 ? String(minted) : null);
  const loss = token ? ctoadExtra(token).loss : undefined;
  return (
    <ToadWindow
      className="shadow-window w-full max-w-sm"
      title={minted > 0 ? `CTOad #${minted}` : "CTOad preview"}
      caption={
        minted > 0 ? (
          <span className="flex flex-wrap justify-between gap-x-3">
            <span>
              held by {token ? <HolderName accountId={token.owner_id} keep={6} className="underline" /> : "…"}
            </span>
            <span className="text-rekt">{loss ? `−${formatNear(loss, 2)} NEAR` : "…"}</span>
          </span>
        ) : (
          <span className="flex justify-between gap-3">
            <span>Could be yours</span>
            <span>100% on-chain art</span>
          </span>
        )
      }
    >
      {minted > 0 ? (
        <CtoadImage token={token ?? undefined} className="aspect-square w-full" />
      ) : (
        <ToadPreview className="aspect-square w-full text-6xl" />
      )}
    </ToadWindow>
  );
}

/** One row of cells: how many are minted, the price, the fee, and whether the takeover happened. */
export function Progress({ market, config }: { market?: Market; config?: TokenConfig }) {
  const minted = market?.ctoads_minted ?? 0;
  const max = market?.max_ctoads ?? 500;
  const pct = Math.min(100, (minted / max) * 100);
  const cells: [string, React.ReactNode][] = [
    [
      "Minted",
      <>
        {minted}/{max}
        <span className="mt-2 block h-1.5 border border-ink">
          <span className="block h-full bg-ink" style={{ width: `${pct}%` }} />
        </span>
      </>,
    ],
    ["1 $CTO", market ? <PriceTick price={market.price_per_token} /> : "…"],
    ["Fee", config ? `${config.fee_bps / 100}%` : "…"],
    ["Takeover", market?.takeover ? "Live" : "Not yet"],
  ];
  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-ink bg-card md:grid-cols-4">
      {cells.map(([label, value], i) => (
        <div
          key={label}
          className={`border-ink p-4 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b md:border-b-0" : ""} ${
            i === 1 ? "md:border-r" : ""
          }`}
        >
          <p className="font-mono text-xs uppercase text-ink/65">{label}</p>
          <p className="font-display mt-1 text-2xl md:text-3xl">{value}</p>
        </div>
      ))}
    </section>
  );
}

/**
 * The price, which reloads every 5 seconds. When it changes, it flashes green and ▲ or red and ▼,
 * with the change since the last update, so trades show as ticks.
 */
function PriceTick({ price }: { price: string }) {
  const [last, setLast] = useState(price);
  const [tick, setTick] = useState<{ up: boolean; pct: number; n: number } | null>(null);
  // Compare with the last price while rendering, as React suggests for "state from a prop".
  if (price !== last) {
    const before = Number(last);
    setLast(price);
    if (before > 0) setTick({ up: Number(price) > before, pct: ((Number(price) - before) / before) * 100, n: (tick?.n ?? 0) + 1 });
  }
  return (
    <span key={tick?.n} className={tick ? (tick.up ? "tick-up" : "tick-down") : undefined}>
      {formatNear(price)} NEAR
      {tick && (
        <span className={`ml-2 align-middle font-mono text-sm ${tick.up ? "text-frog" : "text-rekt"}`}>
          {tick.up ? "▲" : "▼"} {Math.abs(tick.pct).toFixed(Math.abs(tick.pct) < 1 ? 2 : 1)}%
        </span>
      )}
    </span>
  );
}

/** Texting, the headline feature: what you can text, and an example conversation. */
export function TextYourToad() {
  const commands = [
    "BUY 1",
    "SELL 1000",
    "SET BIO bagholder since day one",
    "TOPUP 10 USDC",
    "STATUS",
    "PRICE",
    "HELP",
  ];
  return (
    <section id="text-your-toad" className="grid scroll-mt-6 overflow-hidden rounded-xl border border-ink bg-card md:grid-cols-[1fr_1.1fr]">
      <div className="space-y-5 border-b border-ink p-6 md:border-r md:border-b-0 md:p-8">
        <p className="font-mono text-xs uppercase text-ink/65">Text your toad</p>
        <h2 className="text-4xl leading-none md:text-5xl">No app. Just iMessage.</h2>
        <p className="max-w-md">
          Link your phone once, then run your account by text: buy, sell, change your profile, or top up from any chain
          with NEAR Intents. Every alert and profile is checked by private AI on NEAR AI Cloud.
        </p>
        {MSGBUBBLES_NUMBER && <p className="font-mono text-sm">Text {MSGBUBBLES_NUMBER}</p>}
        <div className="flex flex-wrap gap-2 font-mono text-xs">
          {commands.map((c) => (
            <span key={c} className="rounded-md border border-ink px-2 py-1">
              {c}
            </span>
          ))}
        </div>
        <Link href="/texts" className="press inline-block bg-ink px-5 py-3 font-medium text-white">
          Link your phone →
        </Link>
      </div>
      <div className="space-y-3 bg-background p-6 md:p-8" aria-label="An example conversation">
        {/* Shortened from the real replies in lib/textCommands.ts: the address comes in a text of its
            own, so a long-press copies just the address. */}
        <Bubble me>TOPUP 10 USDC SOLANA</Bubble>
        <Bubble>
          Send exactly 10 USDC on Solana to the address in the next text. You&apos;ll get about 2.8 NEAR in you.near.
          I&apos;ll text you when it arrives.
        </Bubble>
        <Bubble>
          <span className="font-mono">7xKXtg2C…Mq9fQa</span>
        </Bubble>
        <Bubble>Your 10 USDC on Solana arrived as NEAR in you.near. Tap to buy $CTO with it.</Bubble>
        <Bubble me>SET BIO bagholder since day one</Bubble>
        <Bubble>Saved: ctoads.xyz/@you</Bubble>
        <p className="pt-2 font-mono text-xs text-ink/65">Example conversation.</p>
      </div>
    </section>
  );
}

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <p className={`w-fit max-w-[85%] rounded-2xl border border-ink px-3 py-2 text-sm ${me ? "ml-auto bg-accent" : "bg-card"}`}>
      {children}
    </p>
  );
}

export function HowItWorks({ config }: { config?: TokenConfig }) {
  const loss = config ? formatNear(config.loss_threshold) : "1";
  const max = config?.max_ctoads ?? 500;
  const fee = config ? config.fee_bps / 100 : 1;
  const steps: [string, string, string][] = [
    ["Buy $CTO", `Every buy and sell pays a ${fee}% fee.`, "bg-card"],
    ["Sell at a loss", `Lose ${loss} NEAR on one sell, mint the next toad.`, "bg-card"],
    ["The takeover", `At toad #${max}, the fees go to the holders.`, "bg-card"],
    ["Claim and vote", "Each toad is its own NEAR account. Claim its fees, vote on the treasury.", "bg-card"],
  ];
  return (
    <section id="how" className="scroll-mt-6 overflow-hidden rounded-xl border border-ink">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([title, body, color], i) => (
          <div
            key={title}
            className={`${color} space-y-2 border-ink p-5 ${i < 3 ? "border-b lg:border-b-0" : ""} ${
              i % 2 === 0 ? "sm:border-r" : ""
            } ${i === 1 ? "lg:border-r" : ""} ${i === 2 ? "sm:border-b-0" : ""}`}
          >
            <p className="font-display text-5xl text-frog">0{i + 1}</p>
            <h3 className="font-bold">{title}</h3>
            <p className="text-sm text-ink/65">{body}</p>
          </div>
        ))}
      </div>
      <details className="border-t border-ink bg-card px-5 py-3 text-sm">
        <summary className="cursor-pointer font-mono text-xs">READ THE RULES</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-ink/80">
          <li>The contract records what you paid for your $CTO. A sell that loses {loss} NEAR or more mints a toad.</li>
          <li>
            Until toad #{max} is minted, the {fee}% fee goes to the deployer. From then on, it goes to the holders.
          </li>
          <li>
            Every toad has its own NEAR account, where its share of the fees collects. Whoever holds the toad claims it.
          </li>
          <li>Holders vote on proposals to spend the treasury. One toad, one vote.</li>
        </ul>
      </details>
    </section>
  );
}

/** The newest CTOads, each in a window, linking to the gallery. */
export function Bagholders({ minted }: { minted: number }) {
  if (minted === 0) return null;
  const ids = Array.from({ length: Math.min(8, minted) }, (_, i) => String(minted - i));
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-4xl md:text-5xl">The bagholders</h2>
        <Link href="/ctoads" className="font-mono text-sm underline underline-offset-4">
          See all CTOads →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
    <ToadWindow
      title={<Link href={`/ctoads/${id}`}>CTOad #{id}</Link>}
      caption={
        <span className="block space-y-0.5">
          {loss && <span className="block text-rekt">−{formatNear(loss, 2)} NEAR</span>}
          {token && <HolderName accountId={token.owner_id} keep={6} className="block truncate underline" />}
        </span>
      }
    >
      <Link href={`/ctoads/${id}`}>
        <CtoadImage token={token ?? undefined} className="aspect-square w-full" />
      </Link>
    </ToadWindow>
  );
}
