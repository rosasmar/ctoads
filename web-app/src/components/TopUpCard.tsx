"use client";

import { actionCreators } from "@near-js/transactions";
import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useState } from "react";
import useSWR from "swr";

import { NETWORK, TOKEN_CONTRACT } from "@/config";
import { errorText, Row } from "@/components/TradeFields";
import { useBuyQuote, useDebounced, useHolder } from "@/hooks/useCto";
import { TX, withSlippage } from "@/lib/cto";
import {
  intentsApi,
  STATUS_TEXT,
  TOPUP_ASSETS,
  type TopUpQuote,
  type TopUpStatus,
  WNEAR_CONTRACT,
  WNEAR_STORAGE_DEPOSIT,
} from "@/lib/intents";
import { formatCto, formatNear, formatUnits, parseUnits, view } from "@/lib/near";

/** NEAR Intents only runs on mainnet. On testnet the card shows prices but can't take a deposit. */
const LIVE = NETWORK === "mainnet";
/** Any valid mainnet account works for a price preview. */
const PREVIEW_RECIPIENT = "guest.near";
const DONE: TopUpStatus[] = ["SUCCESS", "REFUNDED", "FAILED"];

/** "No NEAR? Top up from any chain": pay with USDC, ETH, SOL or BTC, get NEAR, buy $CTO. */
export function TopUpCard() {
  const { signedAccountId, signIn, callFunction } = useWalletSelector();
  const [assetId, setAssetId] = useState(TOPUP_ASSETS[0].id);
  const asset = TOPUP_ASSETS.find((a) => a.id === assetId)!;
  const [input, setInput] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [deposit, setDeposit] = useState<{ quote: TopUpQuote; label: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = parseUnits(input, asset.decimals);
  const debounced = useDebounced(amount, 400);
  const recipient = LIVE && signedAccountId ? signedAccountId : PREVIEW_RECIPIENT;
  const { data: preview, error: previewError } = useSWR(
    debounced && debounced > 0n && !deposit ? ["topUpPreview", assetId, debounced.toString(), recipient] : null,
    ([, a, amt, r]) => intentsApi<TopUpQuote>("POST", { body: { asset: a, amount: amt, recipient: r, dry: true } }),
    { refreshInterval: 20_000, keepPreviousData: true },
  );
  const { data: registered, mutate: refreshRegistered } = useWnearRegistered(signedAccountId);

  const getReady = () =>
    run(async () => {
      await callFunction({
        contractId: WNEAR_CONTRACT,
        method: "storage_deposit",
        args: { account_id: signedAccountId, registration_only: true },
        gas: 30_000_000_000_000n,
        deposit: WNEAR_STORAGE_DEPOSIT,
      });
      await refreshRegistered();
    });

  const getAddress = () =>
    run(async () => {
      if (!amount || !signedAccountId) return;
      const quote = await intentsApi<TopUpQuote>("POST", {
        body: { asset: assetId, amount: amount.toString(), recipient: signedAccountId, refundTo, dry: false },
      });
      setDeposit({ quote, label: `${formatUnits(quote.amountIn, asset.decimals, 8)} ${asset.symbol} on ${asset.chain}` });
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="topup" className="scroll-mt-6 space-y-4 rounded-2xl border-2 border-ink bg-card p-5 shadow-hard">
      <div>
        <h2 className="text-2xl">No NEAR? Top up from any chain</h2>
        <p className="mt-1 text-sm text-ink/65">
          Send USDC, ETH, SOL or BTC from another chain. NEAR Intents swaps it to NEAR in your wallet, usually in under
          a minute, then you buy $CTO with it.
          {!LIVE && " NEAR Intents only runs on mainnet, so on testnet this only shows prices."}
        </p>
      </div>

      {LIVE && signedAccountId && <WnearBuy accountId={signedAccountId} />}

      {deposit ? (
        <DepositBox quote={deposit.quote} label={deposit.label} onDone={() => setDeposit(null)} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs text-ink/65">
              Pay with
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="mt-1 block w-full rounded-xl border-2 border-ink bg-white px-3 py-2.5 text-base text-ink"
              >
                {TOPUP_ASSETS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol} on {a.chain}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-ink/65">
              Amount
              <span className="mt-1 flex items-center gap-2 rounded-xl border-2 border-ink bg-white px-3 py-2">
                <input
                  inputMode="decimal"
                  placeholder="0.0"
                  value={input}
                  onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ""))}
                  className="w-full bg-transparent text-xl text-ink outline-none"
                />
                <span>{asset.symbol}</span>
              </span>
            </label>
            {LIVE && (
              <label className="block text-xs text-ink/65">
                Your {asset.chain} address, for a refund if the swap fails
                <input
                  value={refundTo}
                  onChange={(e) => setRefundTo(e.target.value.trim())}
                  placeholder={asset.kind === "evm" ? "0x…" : asset.kind === "sol" ? "Solana address" : "bc1…"}
                  className="mt-1 block w-full rounded-xl border-2 border-ink bg-white px-3 py-2.5 font-mono text-sm text-ink"
                />
              </label>
            )}
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-xl bg-ink/5 p-4">
            {preview && amount ? (
              <dl className="space-y-1 text-sm">
                <Row label="You get (about)" value={`${formatNear(preview.amountOut)} NEAR`} />
                {preview.amountInUsd && <Row label="Worth" value={`$${Number(preview.amountInUsd).toFixed(2)}`} />}
                <Row label="Takes about" value={`${preview.timeEstimate} seconds`} />
                <Row label="Swap by" value="NEAR Intents" />
              </dl>
            ) : (
              <p className="text-sm text-ink/65">
                {previewError && amount ? previewError.message : "Enter an amount to see what you'd get."}
              </p>
            )}
            {!LIVE ? null : !signedAccountId ? (
              <button onClick={() => signIn()} className="press w-full rounded-xl bg-accent py-3 font-semibold text-ink">
                Connect wallet to top up
              </button>
            ) : registered === false ? (
              <button
                disabled={busy}
                onClick={getReady}
                className="press w-full rounded-xl bg-accent py-3 font-semibold text-ink disabled:opacity-40"
              >
                {busy ? "Confirm in your wallet…" : "Get ready to receive NEAR (0.00125 NEAR, once)"}
              </button>
            ) : (
              <button
                disabled={!preview || !amount || !refundTo || busy || registered === undefined}
                onClick={getAddress}
                className="press w-full rounded-xl bg-accent py-3 font-semibold text-ink disabled:opacity-40"
              >
                {busy ? "Getting an address…" : "Get deposit address"}
              </button>
            )}
          </div>
        </div>
      )}
      {message && <p className="text-sm text-rekt">{message}</p>}
    </section>
  );
}

/** Where to send the deposit, and how the swap is going. */
function DepositBox({ quote, label, onDone }: { quote: TopUpQuote; label: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const { data } = useSWR(
    ["topUpStatus", quote.depositAddress],
    ([, address]) => intentsApi<{ status: TopUpStatus }>("GET", { query: `?depositAddress=${encodeURIComponent(address!)}` }),
    { refreshInterval: (latest) => (latest && DONE.includes(latest.status) ? 0 : 5_000) },
  );
  const status = data?.status ?? "PENDING_DEPOSIT";
  const deadline = quote.deadline
    ? new Date(quote.deadline).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : null;

  const copy = async () => {
    await navigator.clipboard.writeText(quote.depositAddress!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-ink p-4">
      <p className="text-sm">
        Send exactly <strong>{label}</strong> to this address{deadline && <> before {deadline}</>}:
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-ink/5 px-3 py-2 text-sm">{quote.depositAddress}</code>
        <button onClick={copy} className="press shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-bold">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-sm">
        You get about <strong>{formatNear(quote.amountOut)} NEAR</strong>, at least {formatNear(quote.minAmountOut)}.
      </p>
      <p className={`text-sm font-bold ${status === "SUCCESS" ? "text-frog" : status === "REFUNDED" || status === "FAILED" ? "text-rekt" : ""}`}>
        {STATUS_TEXT[status]}
      </p>
      {DONE.includes(status) && (
        <button onClick={onDone} className="text-sm font-bold underline underline-offset-4">
          Top up again
        </button>
      )}
    </div>
  );
}

/** Whether wrap.near can hold `accountId`'s wNEAR yet. undefined while loading. */
function useWnearRegistered(accountId: string | null) {
  return useSWR(LIVE && accountId ? ["wnearRegistered", accountId] : null, async ([, id]) =>
    Boolean(await view<unknown>(WNEAR_CONTRACT, "storage_balance_of", { account_id: id })),
  );
}

/**
 * NEAR Intents delivers wrapped NEAR. When some is waiting in the wallet, this unwraps it and buys
 * $CTO with it, in one wallet request.
 */
function WnearBuy({ accountId }: { accountId: string }) {
  const { signAndSendTransactions } = useWalletSelector();
  const { mutate: refreshHolder } = useHolder(accountId);
  const { data: balance, mutate: refreshBalance } = useSWR(
    ["wnear", accountId],
    async ([, id]) => BigInt(await view<string>(WNEAR_CONTRACT, "ft_balance_of", { account_id: id })),
    { refreshInterval: 10_000 },
  );
  const { data: quote } = useBuyQuote(accountId, balance && balance > 0n ? balance : null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!balance && !message) return null;

  const buy = async () => {
    if (!balance || !quote) return;
    setBusy(true);
    setMessage(null);
    try {
      const min = withSlippage(BigInt(quote.tokens_out));
      // Wallets send them in order: the NEAR is unwrapped before the buy spends it.
      await signAndSendTransactions({
        transactions: [
          {
            signerId: accountId,
            receiverId: WNEAR_CONTRACT,
            actions: [actionCreators.functionCall("near_withdraw", { amount: balance.toString() }, 10_000_000_000_000n, 1n)],
          },
          {
            signerId: accountId,
            receiverId: TOKEN_CONTRACT,
            actions: [actionCreators.functionCall("buy", { min_tokens_out: min.toString() }, TX.buy.gas, balance)],
          },
        ],
      });
      setMessage("Bought. Welcome to the bag.");
      refreshBalance();
      refreshHolder();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-frog bg-frog/10 p-4">
      {balance ? (
        <>
          <p className="flex-1 text-sm">
            <strong>{formatNear(balance)} NEAR</strong> arrived from your top-up
            {quote && <> and buys about {formatCto(quote.tokens_out)} $CTO</>}.
          </p>
          <button
            disabled={!quote || busy}
            onClick={buy}
            className="press rounded-xl bg-accent px-4 py-2.5 font-semibold text-ink disabled:opacity-40"
          >
            {busy ? "Confirm in your wallet…" : "Buy $CTO with it"}
          </button>
        </>
      ) : (
        <p className="text-sm">{message}</p>
      )}
      {balance && message ? <p className="w-full text-sm text-rekt">{message}</p> : null}
    </div>
  );
}
