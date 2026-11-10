"use client";

import { actionCreators } from "@near-js/transactions";
import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";

import { NFT_CONTRACT, TOKEN_CONTRACT } from "@/config";
import { AccountLink } from "@/components/AccountLink";
import { CtoadImage, CtoadTraits } from "@/components/CtoadImage";
import { AmountInput, errorText, Row } from "@/components/TradeFields";
import { useBuyQuote, useCtoad, useCtoadFunds, useHolder, useSellQuote } from "@/hooks/useCto";
import { ctoadAccountId, ctoadCallArgs, ctoadExtra, TX, withSlippage, type SellQuote } from "@/lib/cto";
import { formatCto, formatNear, parseNear } from "@/lib/near";

/** One CTOad: its image, traits, holder, and its backpack, the account it owns. */
export function CtoadPage({ id }: { id: string }) {
  const valid = /^[1-9]\d*$/.test(id);
  const { data: token, isLoading } = useCtoad(valid ? id : null);

  if (!valid || (!isLoading && token === null)) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-3xl font-bold">No CTOad #{id}</h1>
        <p className="mt-2 text-ink/65">It hasn&apos;t been minted.</p>
        <Link href="/ctoads" className="mt-6 inline-block text-frog hover:underline">
          ← All CTOads
        </Link>
      </div>
    );
  }

  const extra = token ? ctoadExtra(token) : {};
  return (
    <div className="space-y-6">
      <Link href="/ctoads" className="text-sm text-ink/65 hover:text-ink">
        ← All CTOads
      </Link>
      <div className="grid gap-8 md:grid-cols-[minmax(0,420px)_1fr]">
        <CtoadImage token={token ?? undefined} className="aspect-square w-full rounded-2xl border-4 border-ink shadow-hard" />
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">CTOad #{id}</h1>
            {extra.loss && <p className="mt-1 font-mono font-bold text-rekt">Lost {formatNear(extra.loss, 2)} NEAR</p>}
            {token && (
              <p className="mt-1 text-sm text-ink/65">
                Held by <AccountLink id={token.owner_id} keep={16} />
              </p>
            )}
          </div>
          {token && <CtoadTraits token={token} className="w-fit text-sm" />}
          {token && <Backpack id={id} holder={token.owner_id} />}
        </div>
      </div>
    </div>
  );
}

/** What the CTOad's own account holds. Its holder controls it, and it moves with the CTOad. */
function Backpack({ id, holder }: { id: string; holder: string }) {
  const { signedAccountId } = useWalletSelector();
  const account = ctoadAccountId(id);
  const { data: funds, mutate: refreshFunds } = useCtoadFunds(id);
  const { data: bag, mutate: refreshBag } = useHolder(account);
  const balance = bag ? BigInt(bag.balance) : 0n;
  const { data: worth } = useSellQuote(balance > 0n ? account : null, balance);
  const unswept = funds ? BigInt(funds.account.unswept_fees) : 0n;

  return (
    <section className="rounded-2xl border-2 border-ink shadow-hard bg-card p-5">
      <h2 className="font-semibold">Backpack</h2>
      <p className="mt-1 text-sm text-ink/65">
        This CTOad&apos;s own account, <AccountLink id={account} keep={24} />. Whoever holds the CTOad controls it, and
        selling the CTOad hands over everything in it.
      </p>
      {funds?.account.state !== "Ready" && funds && (
        <p className="mt-4 text-sm text-ink">This CTOad has no account yet.</p>
      )}
      <dl className="mt-4 space-y-1 text-sm">
        <Row label="NEAR" value={funds ? `${formatNear(funds.inAccount)} NEAR` : "…"} />
        {unswept > 0n && <Row label="Fees not swept in yet" value={`${formatNear(unswept)} NEAR`} />}
        <Row
          label="$CTO"
          value={bag ? `${formatCto(balance)} $CTO` : "…"}
          // The quote keeps its last value after a sell empties the bag, so check the bag too.
          note={worth && balance > 0n ? `worth about ${formatNear(worth.near_out)} NEAR` : undefined}
        />
      </dl>
      {signedAccountId === holder && funds?.account.state === "Ready" && (
        <BackpackActions
          id={id}
          available={funds.inAccount}
          unswept={unswept}
          bag={balance}
          sellQuote={worth}
          onDone={() => {
            refreshFunds();
            refreshBag();
          }}
        />
      )}
    </section>
  );
}

/**
 * The holder's controls: the CTOad's account buys $CTO with its own NEAR, or sells its whole bag.
 * Each is a `ctoad_call`. A buy that needs fees not yet in the account sweeps them in first.
 */
function BackpackActions(props: {
  id: string;
  available: bigint;
  unswept: bigint;
  bag: bigint;
  sellQuote?: SellQuote;
  onDone: () => void;
}) {
  const { id, available, unswept, bag, sellQuote, onDone } = props;
  const { signedAccountId, callFunction, signAndSendTransactions } = useWalletSelector();
  const account = ctoadAccountId(id);
  const [input, setInput] = useState("");
  const amount = parseNear(input);
  const { data: buyQuote } = useBuyQuote(account, amount);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tooMuch = amount !== null && amount > available + unswept;
  const needsSweep = amount !== null && amount > available;

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus(done);
      setInput("");
      onDone();
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  /** A `ctoad_call` on the NFT contract that makes this CTOad's account call the token contract. */
  const ctoadCall = (method: string, args: object, deposit: bigint, gas: bigint) => ({
    contractId: NFT_CONTRACT,
    method: "ctoad_call",
    args: ctoadCallArgs(id, TOKEN_CONTRACT, method, args, deposit, gas),
    gas: gas + TX.ctoadCall.extraGas,
    deposit: TX.ctoadCall.deposit,
  });

  const buy = () =>
    run(async () => {
      if (!amount || !buyQuote || !signedAccountId) return;
      const min = withSlippage(BigInt(buyQuote.tokens_out));
      const call = ctoadCall("buy", { min_tokens_out: min.toString() }, amount, TX.buy.gas);
      if (!needsSweep) {
        await callFunction(call);
        return;
      }
      // One wallet request for both, so a popup wallet opens once, right on the click.
      // Wallets send them in order: the sweep lands before the buy.
      const sweep = actionCreators.functionCall("sweep", { token_ids: [id] }, TX.sweep.gas, 0n);
      await signAndSendTransactions({
        transactions: [
          { signerId: signedAccountId, receiverId: TOKEN_CONTRACT, actions: [sweep] },
          {
            signerId: signedAccountId,
            receiverId: call.contractId,
            actions: [actionCreators.functionCall(call.method, call.args, call.gas, call.deposit)],
          },
        ],
      });
    }, `CTOad #${id} bought $CTO.`);

  const sell = () =>
    run(async () => {
      if (!sellQuote) return;
      const min = withSlippage(BigInt(sellQuote.near_out));
      await callFunction(
        ctoadCall("sell", { amount: bag.toString(), min_near_out: min.toString() }, TX.sell.deposit, TX.sell.gas),
      );
    }, `CTOad #${id} sold its $CTO. The NEAR is in its backpack, ready to claim.`);

  return (
    <div className="mt-5 space-y-4 border-t border-ink/15 pt-5">
      <p className="text-sm text-ink/65">You hold this CTOad, so you decide what its account does.</p>
      <AmountInput
        label="Buy $CTO with the backpack's NEAR"
        unit="NEAR"
        value={input}
        onChange={setInput}
        hint={`${formatNear(available + unswept)} NEAR available`}
      />
      {buyQuote && amount && (
        <dl className="space-y-1 text-sm">
          <Row label="It gets (about)" value={`${formatCto(buyQuote.tokens_out)} $CTO`} />
          <Row label="Fee" value={`${formatNear(buyQuote.fee)} NEAR`} />
          {BigInt(buyQuote.storage_cost) > 0n && (
            <Row label="One-time storage" value={`${formatNear(buyQuote.storage_cost, 5)} NEAR`} />
          )}
        </dl>
      )}
      {tooMuch && <p className="text-sm text-rekt">The backpack doesn&apos;t hold that much NEAR.</p>}
      {needsSweep && !tooMuch && (
        <p className="text-xs text-ink/65">
          This also moves the fees waiting outside into the backpack first, so your wallet asks you to approve two
          transactions at once.
        </p>
      )}
      <button
        disabled={!amount || !buyQuote || tooMuch || busy}
        onClick={buy}
        className="w-full rounded-xl press bg-accent py-3 font-semibold text-ink disabled:opacity-40"
      >
        {busy ? "Confirm in your wallet…" : "Buy $CTO"}
      </button>
      {bag > 0n && (
        <button
          disabled={!sellQuote || busy}
          onClick={sell}
          className="w-full rounded-xl border border-rekt/60 py-3 font-semibold text-rekt disabled:opacity-40"
        >
          {sellQuote ? `Sell all ${formatCto(bag)} $CTO for about ${formatNear(sellQuote.near_out)} NEAR` : "Sell all $CTO"}
        </button>
      )}
      {status && <p className="text-sm text-ink/80">{status}</p>}
    </div>
  );
}
