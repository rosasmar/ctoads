import Link from "next/link";

import { DAILY_ALERT_LIMIT } from "@/lib/alerts";

const POINTS = [
  { title: "Ping about trades", body: "A big buy, a dip, a backpack move: tell every holder at once." },
  { title: "Rally the vote", body: "Remind holders to vote before a treasury proposal closes." },
  { title: "Only your account name shows", body: "Alerts come from one CTOads number. Holders see your account name, never your phone number." },
];

/** What alerts are for, shown above the Alerts and Send pages. */
export function AlertsPitch({ title }: { title: string }) {
  return (
    <section className="space-y-6">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-frog">{title}</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Text your fellow holders, keep your number private</h1>
        <p className="mx-auto mt-3 max-w-xl text-white/60">
          Alerts let CTOad holders ping the whole community by text, about trades, votes, or anything worth knowing,
          without sharing their own phone number.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-xl border border-white/10 bg-panel p-4">
            <h2 className="font-semibold text-frog">{p.title}</h2>
            <p className="mt-1 text-sm text-white/60">{p.body}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-white/40">
        Only CTOad holders can sign up and send, {DAILY_ALERT_LIMIT} alerts a day each, checked for harmful content.
        Every alert links to a page where anyone can remove their number.{" "}
        <Link href="/terms" className="hover:text-white">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:text-white">
          Privacy
        </Link>
      </p>
    </section>
  );
}
