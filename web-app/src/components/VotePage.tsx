"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useState } from "react";
import useSWR from "swr";

import { CONFIGURED, NETWORK, NFT_CONTRACT } from "@/config";
import { AccountLink } from "@/components/AccountLink";
import { useMarket, useNow, useProposals } from "@/hooks/useCto";
import { hasVoted, nftTokensForOwner, TX, type Proposal, type ProposalStatus } from "@/lib/cto";
import { formatNear, parseNear } from "@/lib/near";

/** Same limit as MAX_DESCRIPTION_LEN in voting.rs, in bytes. */
const MAX_DESCRIPTION_BYTES = 280;

type Wallet = ReturnType<typeof useWalletSelector>;

const STATUS_STYLE: Record<ProposalStatus, string> = {
  Open: "bg-sky-400/15 text-sky-300",
  Passed: "bg-frog/15 text-frog",
  Failed: "bg-rekt/15 text-rekt",
  Executed: "bg-ink/10 text-ink/80",
};

export function VotePage() {
  const wallet = useWalletSelector();
  const { signedAccountId } = wallet;
  const { data: market } = useMarket();
  const { data: proposals, mutate: refreshProposals } = useProposals();
  const { data: tokens } = useSWR(CONFIGURED && signedAccountId ? ["mine", signedAccountId] : null, ([, id]) =>
    nftTokensForOwner(id),
  );
  const myIds = (tokens ?? []).map((t) => t.token_id).sort((a, b) => Number(a) - Number(b));
  const newestFirst = [...(proposals ?? [])].reverse();
  const soldOut = market ? market.ctoads_minted >= market.max_ctoads : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Treasury votes</h1>
          <p className="mt-1 max-w-xl text-ink/65">
            After the takeover, 10% of every fee goes to the treasury. CTOad holders vote on where it goes: one vote
            per CTOad.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink/65">Treasury</p>
          <p className="text-2xl font-bold text-frog">{market ? formatNear(market.treasury_balance) : "…"} NEAR</p>
          {market && <p className="text-xs text-ink/65">{formatNear(market.treasury_total)} NEAR received in total</p>}
        </div>
      </div>

      <p className="rounded-xl bg-ink/5 p-4 text-sm text-ink/80">
        A proposal passes as soon as 51% of all CTOads vote yes, and fails as soon as 51% vote no. Otherwise it&apos;s
        decided when voting ends: it passes with 51% of the votes cast, if at least 10% of CTOads voted.
      </p>

      {!signedAccountId ? (
        <p className="text-sm text-ink/65">
          <button onClick={() => wallet.signIn()} className="text-frog hover:underline">
            Connect the wallet
          </button>{" "}
          that holds your CTOads to propose and vote.
        </p>
      ) : market && !soldOut ? (
        <p className="text-sm text-ink/65">
          Proposals open once every CTOad is minted ({market.ctoads_minted} of {market.max_ctoads} so far).
        </p>
      ) : tokens && myIds.length === 0 ? (
        <p className="text-sm text-ink/65">Only CTOad holders can propose and vote. This wallet holds none.</p>
      ) : (
        myIds.length > 0 && (
          <ProposeForm
            wallet={wallet}
            treasury={market ? BigInt(market.treasury_balance) : 0n}
            onDone={() => refreshProposals()}
          />
        )
      )}

      {proposals && proposals.length === 0 && (
        <p className="rounded-xl bg-ink/5 p-6 text-center text-ink/65">
          No proposals yet. Holders can propose once every CTOad is minted.
        </p>
      )}

      <div className="space-y-4">
        {newestFirst.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            maxCtoads={market?.max_ctoads ?? 0}
            myIds={myIds}
            wallet={wallet}
            onDone={() => refreshProposals()}
          />
        ))}
      </div>
    </div>
  );
}

function ProposeForm({ wallet, treasury, onDone }: { wallet: Wallet; treasury: bigint; onDone: () => void }) {
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [receiver, setReceiver] = useState(wallet.signedAccountId ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = parseNear(amountInput);
  const bytes = new TextEncoder().encode(description).length;
  const valid = bytes > 0 && bytes <= MAX_DESCRIPTION_BYTES && amount !== null && amount > 0n && receiver.length > 0;

  const propose = async () => {
    if (!valid || amount === null) return;
    setBusy(true);
    setStatus(null);
    try {
      await wallet.callFunction({
        contractId: NFT_CONTRACT,
        method: "propose",
        args: { description, receiver_id: receiver.trim(), amount: amount.toString() },
        gas: TX.propose.gas,
        deposit: TX.propose.deposit,
      });
      setDescription("");
      setAmountInput("");
      setStatus("Proposed. It shows below once the transaction lands.");
      onDone();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-ink bg-card p-4">
      <p className="font-semibold">New proposal</p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What is the payout for?"
        rows={2}
        className="w-full rounded-lg bg-ink/5 p-2 text-sm outline-none focus:ring-1 focus:ring-ink"
      />
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            inputMode="decimal"
            placeholder="0.005"
            className="w-28 rounded-lg bg-ink/5 p-2 outline-none focus:ring-1 focus:ring-ink"
          />
          NEAR to
        </label>
        <input
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
          placeholder={NETWORK === "mainnet" ? "account.near" : "account.testnet"}
          className="min-w-0 flex-1 rounded-lg bg-ink/5 p-2 font-mono outline-none focus:ring-1 focus:ring-ink"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/65">
        <span>
          {bytes}/{MAX_DESCRIPTION_BYTES} · Attaches 0.01 NEAR for storage, the rest is refunded.
          {amount !== null && amount > treasury && (
            <span className="text-ink"> The treasury holds less than this right now.</span>
          )}
        </span>
        <button
          onClick={propose}
          disabled={!valid || busy}
          className="rounded-xl press bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
        >
          {busy ? "Confirm in your wallet…" : "Propose"}
        </button>
      </div>
      {status && <p className="text-sm text-ink/80">{status}</p>}
    </div>
  );
}

// Cards render only once proposals load in the browser, so the clock never runs during prerender.
function ProposalCard({
  proposal: p,
  maxCtoads,
  myIds,
  wallet,
  onDone,
}: {
  proposal: Proposal;
  maxCtoads: number;
  myIds: string[];
  wallet: Wallet;
  onDone: () => void;
}) {
  const now = useNow(1_000);
  const pct = (votes: number) => (maxCtoads ? (votes / maxCtoads) * 100 : 0);
  const open = p.status === "Open" && p.voting_ends_ms > now;
  // Which of your CTOads haven't voted on this proposal yet.
  const { data: canVote, mutate: refreshCanVote } = useSWR(
    open && myIds.length ? ["canVote", p.id, myIds.join(",")] : null,
    async () => {
      const voted = await Promise.all(myIds.map((id) => hasVoted(p.id, id)));
      return myIds.filter((_, i) => !voted[i]);
    },
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (calls: { method: string; args: Record<string, unknown>; gas: bigint }[], done: string) => {
    setBusy(true);
    setStatus(null);
    try {
      for (const call of calls) await wallet.callFunction({ contractId: NFT_CONTRACT, ...call });
      setStatus(done);
      onDone();
      refreshCanVote();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const vote = (approve: boolean) => {
    const ids = canVote ?? [];
    const calls = [];
    for (let i = 0; i < ids.length; i += TX.vote.batch) {
      const batch = ids.slice(i, i + TX.vote.batch);
      calls.push({ method: "vote", args: { proposal_id: p.id, token_ids: batch, approve }, gas: TX.vote.gas });
    }
    return send(calls, `Voted ${approve ? "yes" : "no"} with ${ids.length} CTOad${ids.length === 1 ? "" : "s"}.`);
  };

  const execute = () =>
    send(
      [{ method: "execute", args: { proposal_id: p.id }, gas: TX.execute.gas }],
      "Executed. The treasury is sending the NEAR.",
    );

  return (
    <div className="space-y-3 rounded-xl border-2 border-ink bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-ink/65">Proposal #{p.id}</p>
          <p className="break-words font-semibold">{p.description}</p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{p.status}</span>
      </div>

      <p className="text-sm">
        Send <span className="text-frog">{formatNear(p.amount)} NEAR</span> to{" "}
        <AccountLink id={p.receiver_id} />
        <span className="text-ink/65"> · proposed by </span>
        <AccountLink id={p.proposer} />
      </p>

      <div className="space-y-1 text-sm">
        <div className="flex h-2 overflow-hidden rounded bg-ink/10">
          <div className="bg-frog" style={{ width: `${pct(p.yes)}%` }} />
          <div className="bg-rekt" style={{ width: `${pct(p.no)}%` }} />
        </div>
        <p className="text-ink/65">
          <span className="text-frog">{p.yes} yes</span> · <span className="text-rekt">{p.no} no</span> · of{" "}
          {maxCtoads || "…"} CTOads
        </p>
      </div>

      <p className="text-xs text-ink/65">{timeLine(p, maxCtoads, now)}</p>

      {wallet.signedAccountId && open && canVote && canVote.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => vote(true)}
            disabled={busy}
            className="rounded-xl press bg-accent px-4 py-2 font-semibold text-ink disabled:opacity-40"
          >
            Vote yes
          </button>
          <button
            onClick={() => vote(false)}
            disabled={busy}
            className="rounded-xl press bg-rekt px-4 py-2 font-semibold text-white disabled:opacity-40"
          >
            Vote no
          </button>
          <span className="text-ink/65">
            with CTOad{canVote.length === 1 ? "" : "s"} #{canVote.join(", #")}. Votes are final.
          </span>
        </div>
      )}
      {wallet.signedAccountId && open && canVote && canVote.length === 0 && (
        <p className="text-sm text-ink/65">All your CTOads have voted on this one.</p>
      )}
      {wallet.signedAccountId && p.status === "Passed" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={execute}
            disabled={busy}
            className="rounded-xl press bg-accent px-4 py-2 font-semibold text-ink disabled:opacity-40"
          >
            Execute
          </button>
          <span className="text-ink/65">Anyone can execute a passed proposal. It pays out from the treasury.</span>
        </div>
      )}
      {busy && <p className="text-sm text-ink/80">Confirm in your wallet…</p>}
      {status && <p className="text-sm text-ink/80">{status}</p>}
    </div>
  );
}

function timeLine(p: Proposal, maxCtoads: number, now: number): string {
  const ends = new Date(p.voting_ends_ms).toLocaleString();
  const left = p.voting_ends_ms - now;
  // Same rounding as share_of in voting.rs: 51% of all CTOads, rounded up.
  const majority = Math.ceil((maxCtoads * 51) / 100);
  if (p.status !== "Open") {
    const early = maxCtoads > 0 && (p.yes >= majority || p.no >= majority);
    return early ? "Decided early by a 51% majority" : `Voting ended ${ends}`;
  }
  if (left <= 0) return "Voting has ended. The result shows in a moment.";
  return `Voting ends in ${formatDuration(left)} (${ends})`;
}

function formatDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
