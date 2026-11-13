"use client";

import Link from "next/link";

import { CtoadImage, ToadPreview } from "@/components/CtoadImage";
import { HolderName } from "@/components/HolderName";
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
    <div className="overflow-hidden whitespace-nowrap border-y border-ink bg-card py-1.5 font-mono text-xs">
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
    <section className="grid border border-ink bg-card md:grid-cols-[1.35fr_1fr]">
      <div className="relative space-y-7 border-b border-ink p-6 md:border-r md:border-b-0 md:p-8">
        <span className="font-display absolute top-6 right-6 hidden -rotate-12 rounded-[50%] border-[3px] border-rekt bg-card px-7 py-2.5 text-4xl text-rekt md:block">
          REKT
        </span>
        <p className="font-mono text-xs">[ MEMBERSHIP COSTS A LOSS ]</p>
        <h1 className="pt-6 text-6xl leading-[0.9] md:text-8xl">
          Sell at a loss.
          <br />
          Get a <span className="bg-accent px-2">toad.</span>
        </h1>
        <p className="max-w-lg text-lg">
          Lose {loss} NEAR on a $CTO sell, get one of {max} toads. At #{max}, the toads take over the fees.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="#trade" className="press bg-ink px-6 py-3 font-medium text-white">
            Start losing
          </a>
          <a href="#text-your-toad" className="press bg-card px-6 py-3 font-medium">
            Text your toad
          </a>
        </div>
      </div>
      <div className="flex items-center justify-center bg-accent p-8 md:p-10">
        <NewestCtoad minted={market?.ctoads_minted ?? 0} />
      </div>
    </section>
  );
}

/** A window frame, like an old desktop app: a title bar, the content, and a caption. */
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
    <div className={`border border-ink bg-card ${className ?? ""}`}>
      <div className="flex justify-between border-b border-ink px-3 py-1.5 font-mono text-xs">
        <span className="truncate">{title}</span>
        <span aria-hidden="true">×</span>
      </div>
      {children}
      {caption && <div className="border-t border-ink px-3 py-2 font-mono text-xs">{caption}</div>}
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
      title={minted > 0 ? `ctoad_svg ${minted}` : "ctoad_svg --preview"}
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
            <span>NONE MINTED YET</span>
            <span>art drawn on-chain</span>
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
    ["1 $CTO", market ? `${formatNear(market.price_per_token)} NEAR` : "…"],
    ["Fee", config ? `${config.fee_bps / 100}%` : "…"],
    ["Takeover", market?.takeover ? "Live" : "Not yet"],
  ];
  return (
    <section className="grid grid-cols-2 border border-ink bg-card md:grid-cols-4">
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
    <section id="text-your-toad" className="grid scroll-mt-6 border border-ink bg-card md:grid-cols-[1fr_1.1fr]">
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
            <span key={c} className="border border-ink px-2 py-1">
              {c}
            </span>
          ))}
        </div>
        <Link href="/texts" className="press inline-block bg-ink px-5 py-3 font-medium text-white">
          Link your phone →
        </Link>
      </div>
      <div className="space-y-3 bg-background p-6 md:p-8" aria-label="An example conversation">
        <Bubble me>TOPUP 10 USDC</Bubble>
        <Bubble>
          Send exactly 10 USDC on Base to: 0x7a…c41f. You&apos;ll get about 2.8 NEAR. I&apos;ll text you when it
          arrives.
        </Bubble>
        <Bubble>Your 10 USDC on Base arrived as NEAR. Tap to buy $CTO with it.</Bubble>
        <Bubble me>SET BIO bagholder since day one</Bubble>
        <Bubble>Saved: ctoads.xyz/@you</Bubble>
        <p className="pt-2 font-mono text-xs text-ink/65">Example conversation.</p>
      </div>
    </section>
  );
}

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <p className={`w-fit max-w-[85%] border border-ink px-3 py-2 text-sm ${me ? "ml-auto bg-accent" : "bg-card"}`}>
      {children}
    </p>
  );
}

export function HowItWorks({ config }: { config?: TokenConfig }) {
  const loss = config ? formatNear(config.loss_threshold) : "1";
  const max = config?.max_ctoads ?? 500;
  const fee = config ? config.fee_bps / 100 : 1;
  const steps: [string, string, string][] = [
    ["Buy $CTO", `Every buy and sell pays a ${fee}% fee.`, "bg-[#ff7eb6]"],
    ["Sell at a loss", `Lose ${loss} NEAR on one sell, mint the next toad.`, "bg-accent"],
    ["The takeover", `At toad #${max}, the fees go to the holders.`, "bg-[#f2c14e]"],
    ["Claim and vote", "Each toad is its own NEAR account. Claim its fees, vote on the treasury.", "bg-[#9cc9ff]"],
  ];
  return (
    <section id="how" className="scroll-mt-6 border border-ink">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([title, body, color], i) => (
          <div
            key={title}
            className={`${color} space-y-2 border-ink p-5 ${i < 3 ? "border-b lg:border-b-0" : ""} ${
              i % 2 === 0 ? "sm:border-r" : ""
            } ${i === 1 ? "lg:border-r" : ""} ${i === 2 ? "sm:border-b-0" : ""}`}
          >
            <p className="font-display text-5xl">0{i + 1}</p>
            <h3 className="font-bold">{title}</h3>
            <p className="text-sm">{body}</p>
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
      title={<Link href={`/ctoads/${id}`}>ctoad #{id}</Link>}
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
