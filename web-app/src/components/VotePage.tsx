"use client";

import { EXPLORER_URL } from "@/config";
import { useMarket, useNow, useProposals } from "@/hooks/useCto";
import type { Proposal, ProposalStatus } from "@/lib/cto";
import { formatNear, shortAccount } from "@/lib/near";

const STATUS_STYLE: Record<ProposalStatus, string> = {
  Open: "bg-sky-400/15 text-sky-300",
  Passed: "bg-frog/15 text-frog",
  Failed: "bg-rekt/15 text-rekt",
  Executed: "bg-white/10 text-white/70",
};

export function VotePage() {
  const { data: market } = useMarket();
  const { data: proposals } = useProposals();
  const newestFirst = [...(proposals ?? [])].reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Treasury votes</h1>
          <p className="mt-1 max-w-xl text-white/60">
            After the takeover, 10% of every fee goes to the treasury. CTOad holders vote on where it goes: one vote
            per CTOad.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-white/50">Treasury</p>
          <p className="text-2xl font-bold text-frog">{market ? formatNear(market.treasury_balance) : "…"} NEAR</p>
          {market && <p className="text-xs text-white/40">{formatNear(market.treasury_total)} NEAR received in total</p>}
        </div>
      </div>

      <p className="rounded-xl bg-white/5 p-4 text-sm text-white/70">
        A proposal passes as soon as 51% of all CTOads vote yes, and fails as soon as 51% vote no. Otherwise it&apos;s
        decided when voting ends: it passes with 51% of the votes cast, if at least 10% of CTOads voted.
      </p>

      {proposals && proposals.length === 0 && (
        <p className="rounded-xl bg-white/5 p-6 text-center text-white/60">
          No proposals yet. Holders can propose once every CTOad is minted.
        </p>
      )}

      <div className="space-y-4">
        {newestFirst.map((p) => (
          <ProposalCard key={p.id} proposal={p} maxCtoads={market?.max_ctoads ?? 0} />
        ))}
      </div>
    </div>
  );
}

// Cards render only once proposals load in the browser, so the clock never runs during prerender.
function ProposalCard({ proposal: p, maxCtoads }: { proposal: Proposal; maxCtoads: number }) {
  const now = useNow(1_000);
  const pct = (votes: number) => (maxCtoads ? (votes / maxCtoads) * 100 : 0);

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-white/40">Proposal #{p.id}</p>
          <p className="break-words font-semibold">{p.description}</p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{p.status}</span>
      </div>

      <p className="text-sm">
        Send <span className="text-frog">{formatNear(p.amount)} NEAR</span> to{" "}
        <AccountLink id={p.receiver_id} />
        <span className="text-white/40"> · proposed by </span>
        <AccountLink id={p.proposer} />
      </p>

      <div className="space-y-1 text-sm">
        <div className="flex h-2 overflow-hidden rounded bg-white/10">
          <div className="bg-frog" style={{ width: `${pct(p.yes)}%` }} />
          <div className="bg-rekt" style={{ width: `${pct(p.no)}%` }} />
        </div>
        <p className="text-white/60">
          <span className="text-frog">{p.yes} yes</span> · <span className="text-rekt">{p.no} no</span> · of{" "}
          {maxCtoads || "…"} CTOads
        </p>
      </div>

      <p className="text-xs text-white/40">{timeLine(p, maxCtoads, now)}</p>
    </div>
  );
}

function AccountLink({ id }: { id: string }) {
  return (
    <a href={`${EXPLORER_URL}/address/${id}`} target="_blank" rel="noreferrer" className="font-mono hover:underline">
      {shortAccount(id)}
    </a>
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
