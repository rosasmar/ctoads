"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useCallback, useEffect, useState } from "react";

import { NETWORK, TOKEN_CONTRACT } from "@/config";
import { UnmintedCtoad } from "@/components/CtoadImage";
import { Bagholders, Hero, HowItWorks, Progress, Ticker } from "@/components/Home";
import { MintModal, type MintMoment } from "@/components/MintModal";
import { TestnetHelp } from "@/components/TestnetHelp";
import { AmountInput, errorText, Row } from "@/components/TradeFields";
import { useBuyQuote, useHolder, useMarket, useNow, useSellQuote, useTokenConfig } from "@/hooks/useCto";
import { TX, whyNoCtoad, withSlippage } from "@/lib/cto";
import { eventsFrom, formatCto, formatNear, parseCto, parseNear, txStatus } from "@/lib/near";

export function TradePage() {
  const { signedAccountId } = useWalletSelector();
  const { data: market, error: marketError } = useMarket();
  const { data: config } = useTokenConfig();
  const [moment, setMoment] = useState<MintMoment | null>(null);

  /** Turns a finished sell transaction into the mint moment, if it earned a CTOad. */
  const onSellOutcome = useCallback(
    (outcome: unknown, accountId: string, sinceMs: number) => {
      const events = eventsFrom(outcome).filter((e) => e.standard === "cto");
      const sell = events.find((e) => e.event === "sell")?.data[0];
      if (!sell?.earned_ctoad) return;
      const minted = events.find((e) => e.event === "ctoad_minted" && e.data[0]?.account_id === accountId)?.data[0];
      setMoment({
        accountId,
        tokenId: (minted?.token_id as string | undefined) ?? null,
        loss: String(sell.loss ?? "0"),
        nearOut: String(sell.near_out ?? "0"),
        sinceMs,
      });
    },
    [],
  );

  useWalletRedirect(signedAccountId, onSellOutcome);

  return (
    <div className="space-y-12">
      {marketError && (
        <p className="rounded-xl bg-rekt/10 p-3 text-sm text-rekt">
          Couldn&apos;t reach the $CTO contract: {String(marketError.message ?? marketError)}
        </p>
      )}
      <Ticker market={market} config={config} />
      <Hero market={market} config={config} />
      <Progress market={market} />
      <div id="trade" className="grid scroll-mt-6 gap-6 md:grid-cols-[1fr_320px]">
        <TradeCard onSellOutcome={onSellOutcome} />
        <Position />
      </div>
      <HowItWorks config={config} />
      <Bagholders minted={market?.ctoads_minted ?? 0} />
      {moment && <MintModal moment={moment} onClose={() => setMoment(null)} />}
    </div>
  );
}

/** Wallets that redirect come back with ?transactionHashes=. Look those up. */
function useWalletRedirect(
  accountId: string | null,
  onSellOutcome: (outcome: unknown, accountId: string, sinceMs: number) => void,
) {
  useEffect(() => {
    if (!accountId) return;
    const params = new URLSearchParams(window.location.search);
    const hashes = params.get("transactionHashes");
    if (!hashes) return;
    window.history.replaceState(null, "", window.location.pathname);
    for (const hash of hashes.split(",")) {
      txStatus(hash, accountId)
        .then((outcome) => onSellOutcome(outcome, accountId, Date.now() - 10 * 60_000))
        .catch(() => {});
    }
  }, [accountId, onSellOutcome]);
}

function TradeCard({ onSellOutcome }: { onSellOutcome: (outcome: unknown, accountId: string, sinceMs: number) => void }) {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  return (
    <section className="rounded-2xl border-2 border-ink shadow-hard bg-card p-5">
      <div className="mb-5 flex gap-2">
        {(["buy", "sell"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize ${
              tab === t ? (t === "buy" ? "bg-accent text-ink" : "bg-rekt text-white") : "bg-ink/5 text-ink/65"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "buy" ? <BuyForm /> : <SellForm onSellOutcome={onSellOutcome} />}
    </section>
  );
}

function BuyForm() {
  const { signedAccountId, signIn, callFunction } = useWalletSelector();
  const { mutate: refreshHolder } = useHolder(signedAccountId);
  const [input, setInput] = useState("");
  const amount = parseNear(input);
  const { data: quote } = useBuyQuote(signedAccountId, amount);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const buy = async () => {
    if (!amount || !quote) return;
    setBusy(true);
    setStatus(null);
    try {
      await callFunction({
        contractId: TOKEN_CONTRACT,
        method: "buy",
        args: { min_tokens_out: withSlippage(BigInt(quote.tokens_out)).toString() },
        gas: TX.buy.gas,
        deposit: amount,
      });
      setStatus("Bought. Welcome to the bag.");
      setInput("");
      refreshHolder();
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <AmountInput label="You pay" unit="NEAR" value={input} onChange={setInput} />
      {quote && amount && (
        <dl className="space-y-1 text-sm">
          <Row label="You get (about)" value={`${formatCto(quote.tokens_out)} $CTO`} />
          <Row label="Fee" value={`${formatNear(quote.fee)} NEAR`} />
          {BigInt(quote.storage_cost) > 0n && (
            <Row label="One-time storage" value={`${formatNear(quote.storage_cost, 5)} NEAR`} />
          )}
        </dl>
      )}
      {signedAccountId ? (
        <button
          disabled={!quote || !amount || busy}
          onClick={buy}
          className="w-full rounded-xl press bg-accent py-3 font-semibold text-ink disabled:opacity-40"
        >
          {busy ? "Confirm in your wallet…" : "Buy $CTO"}
        </button>
      ) : (
        <button onClick={() => signIn()} className="w-full rounded-xl press bg-accent py-3 font-semibold text-ink">
          Connect wallet to buy
        </button>
      )}
      {status && <p className="text-sm text-ink/80">{status}</p>}
    </div>
  );
}

function SellForm({ onSellOutcome }: { onSellOutcome: (outcome: unknown, accountId: string, sinceMs: number) => void }) {
  const { signedAccountId, signIn, callFunction } = useWalletSelector();
  const { data: holder, mutate: refreshHolder } = useHolder(signedAccountId);
  const { data: market } = useMarket();
  const { data: config } = useTokenConfig();
  const [input, setInput] = useState("");
  const amount = parseCto(input);
  const { data: quote } = useSellQuote(signedAccountId, amount);
  const now = useNow();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedAccountId) {
    return (
      <button onClick={() => signIn()} className="w-full rounded-xl press bg-rekt py-3 font-semibold text-white">
        Connect wallet to sell
      </button>
    );
  }

  const balance = holder ? BigInt(holder.balance) : 0n;
  const tooMuch = amount !== null && amount > balance;
  const reason = quote && config && market && holder ? whyNoCtoad({ quote, config, market, holder, nowMs: now }) : null;
  const nextId = market ? market.ctoads_reserved + 1 : null;

  const sell = async () => {
    if (!amount || !quote) return;
    setBusy(true);
    setStatus(null);
    const sinceMs = Date.now() - 60_000;
    try {
      const outcome = await callFunction({
        contractId: TOKEN_CONTRACT,
        method: "sell",
        args: { amount: amount.toString(), min_near_out: withSlippage(BigInt(quote.near_out)).toString() },
        gas: TX.sell.gas,
        deposit: TX.sell.deposit,
      });
      setStatus("Sold.");
      setInput("");
      refreshHolder();
      onSellOutcome(outcome, signedAccountId, sinceMs);
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <AmountInput
        label="You sell"
        unit="$CTO"
        value={input}
        onChange={setInput}
        onMax={balance > 0n ? () => setInput(formatCto(balance, 18).replaceAll(",", "")) : undefined}
        hint={holder ? `Balance: ${formatCto(balance)} $CTO` : undefined}
      />
      {tooMuch && <p className="text-sm text-rekt">That&apos;s more than you hold.</p>}
      {quote && amount && !tooMuch && (
        <>
          <dl className="space-y-1 text-sm">
            <Row label="You get (about)" value={`${formatNear(quote.near_out)} NEAR`} />
            <Row label="Fee" value={`${formatNear(quote.fee)} NEAR`} />
            <Row
              label="Realized loss"
              value={`${formatNear(quote.loss)} NEAR`}
              valueClass={BigInt(quote.loss) > 0n ? "text-rekt" : undefined}
            />
          </dl>
          {quote.earns_ctoad ? (
            <div className="flex items-center gap-3 rounded-xl border border-frog/40 bg-frog/10 p-3">
              <UnmintedCtoad className="h-12 w-12 shrink-0 rounded-lg text-xl" />
              <p className="text-sm">
                <span className="font-semibold text-frog">This sell earns CTOad #{nextId}.</span>{" "}
                <span className="text-ink/80">Getting rekt has never paid this well.</span>
              </p>
            </div>
          ) : (
            reason && <p className="rounded-xl bg-ink/5 p-3 text-sm text-ink/65">{reason}</p>
          )}
        </>
      )}
      <button
        disabled={!quote || !amount || tooMuch || busy}
        onClick={sell}
        className="w-full rounded-xl press bg-rekt py-3 font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Confirm in your wallet…" : quote?.earns_ctoad ? "Sell and mint my CTOad" : "Sell $CTO"}
      </button>
      {status && <p className="text-sm text-ink/80">{status}</p>}
    </div>
  );
}

function Position() {
  const { signedAccountId, callFunction } = useWalletSelector();
  const { data: holder } = useHolder(signedAccountId);
  const balance = holder ? BigInt(holder.balance) : 0n;
  const { data: exit } = useSellQuote(signedAccountId, balance > 0n ? balance : null);

  if (!signedAccountId && NETWORK === "testnet") return <TestnetHelp />;
  if (!signedAccountId || !holder) {
    return (
      <aside className="rounded-2xl border-2 border-ink shadow-hard p-5 text-sm text-ink/65">
        Connect a wallet to see your position.
      </aside>
    );
  }

  const cost = BigInt(holder.cost_basis);
  const value = exit ? BigInt(exit.near_out) : null;
  const pnl = value !== null ? value - cost : null;

  return (
    <aside className="space-y-3 rounded-2xl border-2 border-ink shadow-hard p-5 text-sm">
      <h2 className="font-semibold">Your bag</h2>
      <dl className="space-y-1">
        <Row label="Balance" value={`${formatCto(balance)} $CTO`} />
        <Row label="Cost basis" value={`${formatNear(cost)} NEAR`} />
        {value !== null && <Row label="Worth if sold now" value={`${formatNear(value)} NEAR`} />}
        {pnl !== null && (
          <Row
            label="Unrealized P&L"
            value={`${pnl >= 0n ? "+" : ""}${formatNear(pnl)} NEAR`}
            valueClass={pnl < 0n ? "text-rekt" : "text-frog"}
          />
        )}
        <Row label="Earned a CTOad" value={holder.earned_ctoad ? "Yes" : "Not yet"} />
      </dl>
      {holder.failed_mints > 0 && (
        <button
          onClick={() =>
            callFunction({
              contractId: TOKEN_CONTRACT,
              method: "retry_mint",
              args: { account_id: signedAccountId },
              gas: TX.sell.gas,
            })
          }
          className="w-full rounded-lg border border-ink py-2 text-ink"
        >
          Your CTOad mint failed. Retry it
        </button>
      )}
    </aside>
  );
}
