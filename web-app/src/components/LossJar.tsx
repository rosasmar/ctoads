"use client";

import { useId } from "react";

import { ToadFace } from "@/components/ToadHead";
import { type Holder, type Market, type SellQuote, type TokenConfig, whyNoCtoad } from "@/lib/cto";
import { formatNear } from "@/lib/near";

// The "Your bag" box's loss jar: it fills with what selling the whole bag now would lose, up to
// the loss that earns a CTOad. Near the top a sad toad shows up; once a sell would earn one, the
// jar turns green and the toad smiles. Sold out, or one CTOad per wallet already earned: a lock.

/** Where the toad shows up, as a share of the loss that earns one. */
const TOAD_AT = 0.95;

const JAR = { x: 105, y: 30, w: 90, h: 96 };
/** The REKT label's middle, low enough to leave the top of the jar to the toad. */
const LABEL_Y = JAR.y + JAR.h * 0.7;

type Props = { holder: Holder; quote: SellQuote; config: TokenConfig; market: Market; nowMs: number };

export function LossJar({ holder, quote, config, market, nowMs }: Props) {
  const clip = useId();
  const threshold = BigInt(config.loss_threshold);
  const loss = BigInt(quote.loss);
  const inProfit = BigInt(quote.near_out) >= BigInt(holder.cost_basis);

  const soldOut = market.ctoads_reserved >= market.max_ctoads;
  const alreadyHasOne = config.one_per_wallet && holder.earned_ctoad;
  const locked = soldOut || alreadyHasOne;

  const fill = inProfit || locked ? 0 : Math.min(1, Number(loss) / Number(threshold));
  const earns = quote.earns_ctoad;
  const showToad = !locked && (earns || fill >= TOAD_AT);
  const why = whyNoCtoad({ quote, config, market, holder, nowMs });

  const text = locked
    ? soldOut
      ? "All CTOads are minted. The jar is closed for good."
      : "You already have your CTOad. It's one per wallet."
    : inProfit
      ? "In profit. Nothing in the jar."
      : earns
        ? "Jar full: sell now to mint your toad."
        : fill < 1
          ? `${formatNear(threshold - loss, 2)} NEAR to fill the jar`
          : why;

  const level = JAR.y + JAR.h - fill * JAR.h;
  const liquid = earns ? "fill-accent" : "fill-rekt";

  return (
    <div className="space-y-1 border-t border-line pt-3">
      <svg viewBox="0 0 300 140" className="w-full" role="img" aria-label={`Loss jar: ${text}`}>
        <defs>
          <clipPath id={clip}>
            <rect x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={12} />
          </clipPath>
        </defs>
        {/* Lid */}
        <rect x={JAR.x + 6} y={JAR.y - 14} width={JAR.w - 12} height={14} rx={3} className="fill-line-strong" />
        {/* The liquid: it rises with the loss, and sloshes each time the loss changes. */}
        <g clipPath={`url(#${clip})`}>
          <g style={{ transform: `translateY(${level - JAR.y}px)`, transition: "transform 0.8s ease-out" }}>
            <g key={quote.loss} className="jar-slosh">
              <path
                d={`M${JAR.x - 10} ${JAR.y + 4} q${(JAR.w + 20) / 4} -8 ${(JAR.w + 20) / 2} 0 t${(JAR.w + 20) / 2} 0 V${JAR.y + JAR.h + 10} H${JAR.x - 10} Z`}
                className={liquid}
                opacity={0.85}
              />
            </g>
          </g>
        </g>
        <rect x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={12} fill="none" className="stroke-ink" strokeWidth={2} />
        {/* Label */}
        <rect x={JAR.x + 16} y={LABEL_Y - 14} width={JAR.w - 32} height={28} rx={4} fill="#fffaf0" className="stroke-ink" strokeWidth={1.5} />
        <text x={JAR.x + JAR.w / 2} y={LABEL_Y + 5} fontSize={13} fontWeight={700} textAnchor="middle" className="fill-rekt font-mono">
          REKT
        </text>
        {/* The toad: sad near the top, smiling once a sell would earn it. */}
        <svg
          x={JAR.x + 15}
          y={JAR.y - 4}
          width={60}
          height={48}
          viewBox="0 0 120 96"
          style={{ opacity: showToad ? 1 : 0, transition: "opacity 0.4s" }}
          aria-hidden="true"
        >
          <ToadFace mood={earns ? "happy" : "sad"} />
        </svg>
        {locked && <Lock x={JAR.x + JAR.w / 2} y={JAR.y + 22} />}
        {/* Marks on the side: the loss so far, and the loss that fills the jar. */}
        <text x={JAR.x + JAR.w + 12} y={JAR.y - 4} fontSize={9} className="fill-ink" opacity={0.55}>
          full = {formatNear(threshold, 2)} NEAR
        </text>
        {/* Near the top the toad says it all, so the number hides there. */}
        {fill > 0 && fill < TOAD_AT && (
          <text x={JAR.x + JAR.w + 12} y={level + 4} fontSize={11} fontWeight={600} className="fill-rekt">
            −{formatNear(loss, 2)} NEAR
          </text>
        )}
      </svg>
      <p className={`text-xs ${earns ? "font-semibold" : "text-ink/65"}`}>{text}</p>
    </div>
  );
}

/** A small padlock, centred on (x, y). */
function Lock({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 12} ${y - 12})`} className="stroke-ink" strokeWidth={2.5} fill="none">
      <path d="M6 11 V7 a6 6 0 0 1 12 0 V11" />
      <rect x={3} y={11} width={18} height={14} rx={3} className="fill-ink" />
    </g>
  );
}
