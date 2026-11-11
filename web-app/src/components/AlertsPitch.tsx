import Link from "next/link";

import { DAILY_ALERT_LIMIT } from "@/lib/alerts";
import { MODEL_PROOF_URL } from "@/lib/privateAi";

/** The words that change when alerts can only go by email. */
const BY_TEXT = { verb: "Text", by: "by text", contact: "number", from: "one CTOads number", private: "phone number" };
const BY_EMAIL = { verb: "Email", by: "by email", contact: "address", from: "one CTOads address", private: "email address" };

/** What alerts are for, shown above the Alerts and Send pages. `textEnabled` false means email only. */
export function AlertsPitch({ title, textEnabled }: { title: string; textEnabled: boolean }) {
  const w = textEnabled ? BY_TEXT : BY_EMAIL;
  const points = [
    { title: "Ping about trades", body: "A big buy, a dip, a backpack move: tell every holder at once." },
    { title: "Rally the vote", body: "Remind holders to vote before a treasury proposal closes." },
    {
      title: "Only your name shows",
      body: `Alerts come from ${w.from}. Holders see your @handle, or your account name if you have no profile, never your ${w.private}.`,
    },
  ];
  return (
    <section className="space-y-6">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-frog">{title}</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          {w.verb} your fellow holders, keep your {w.contact} private
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ink/65">
          Alerts let CTOad holders ping the whole community {w.by}, about trades, votes, or anything worth knowing,
          without sharing their own {w.private}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {points.map((p) => (
          <div key={p.title} className="rounded-xl border-2 border-ink bg-card p-4">
            <h2 className="font-sans font-bold text-frog">{p.title}</h2>
            <p className="mt-1 text-sm text-ink/65">{p.body}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-ink/65">
        Only CTOad holders can sign up and send, {DAILY_ALERT_LIMIT} alerts a day each, checked by{" "}
        <a href={MODEL_PROOF_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink">
          private AI
        </a>
        .{" "}
        {textEnabled
          ? "Every alert links to a page where anyone can remove their number."
          : "Every alert email links to the Alerts page to turn them off."}{" "}
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
      </p>
    </section>
  );
}
