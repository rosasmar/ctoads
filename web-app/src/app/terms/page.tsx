import type { Metadata } from "next";
import Link from "next/link";
import { DAILY_ALERT_LIMIT } from "@/lib/alerts";

export const metadata: Metadata = { title: "Terms · CTOads" };

export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-ink/80 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink">
      <div>
        <h1 className="text-3xl font-bold text-ink">Terms</h1>
        <p className="mt-1 text-sm text-ink/65">
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
          Only sign up a phone number or email that&apos;s yours. Emails are only sent to verified addresses. Anyone can remove their number, without a wallet, on the{" "}
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

      <section className="space-y-2">
        <h2>Profiles</h2>
        <p>
          CTOad holders can make a public profile with a handle, a bio and links. The same rules as for alerts apply:
          no spam, scams or phishing links, no harassment or hateful content, nothing illegal, and no one else&apos;s
          personal information. Don&apos;t pretend to be someone else with your handle. Profiles that break these rules
          can be removed.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Text commands</h2>
        <p>
          Only link a phone number that&apos;s yours. Text commands never buy or sell anything: BUY and SELL reply with a
          link, and the trade only happens if you confirm it in your own wallet. We&apos;ll never ask for your seed phrase
          or keys by text. Each number gets at most 20 replies an hour.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Top up from any chain</h2>
        <p>
          Top-ups are swaps run by NEAR Intents (1Click), not by CTOads. A quote is an estimate: you get at least the
          minimum it shows, or your deposit is refunded to the refund address you entered. Send exactly the amount
          shown, of the coin shown, on the chain shown, to that deposit address only. A deposit sent anywhere else
          can&apos;t be recovered. NEAR Intents keeps a small fee from each swap.
        </p>
      </section>
    </article>
  );
}
