import type { Metadata } from "next";
import Link from "next/link";
import { DAILY_ALERT_LIMIT } from "@/lib/alerts";

export const metadata: Metadata = { title: "Terms · CTOads" };

export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-white/80 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white">
      <div>
        <h1 className="text-3xl font-bold text-white">Terms</h1>
        <p className="mt-1 text-sm text-white/50">
          The rules for using this app. See also <Link href="/privacy" className="text-frog hover:underline">privacy</Link>.
        </p>
      </div>

      <section className="space-y-2">
        <h2>A hackathon project</h2>
        <p>
          CTOads was built at NEAR Hackathon 2026. It&apos;s provided as is, with no guarantees. Trades, mints, claims
          and votes are transactions you sign on the NEAR blockchain and can&apos;t be undone. Nothing here is
          financial advice.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Alerts</h2>
        <p>
          Only sign up a phone number that&apos;s yours. Anyone can remove their number, without a wallet, on the{" "}
          <Link href="/alerts/remove" className="text-frog hover:underline">
            remove page
          </Link>
          .
        </p>
        <p>When you send an alert to fellow holders, don&apos;t send:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>spam, scams, phishing links or requests for keys or seed phrases</li>
          <li>harassment, threats or hateful content</li>
          <li>anything illegal, or someone else&apos;s personal information</li>
        </ul>
        <p>
          Each holder can send {DAILY_ALERT_LIMIT} alerts a day, and every alert is logged with the sender&apos;s account.
        </p>
      </section>
    </article>
  );
}
