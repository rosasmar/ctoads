import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · CTOads" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-white/80 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white">
      <div>
        <h1 className="text-3xl font-bold text-white">Privacy</h1>
        <p className="mt-1 text-sm text-white/50">What this app stores about you, and how to delete it. See also the <Link href="/terms" className="text-frog hover:underline">terms</Link>.</p>
      </div>

      <section className="space-y-2">
        <h2>Trading, CTOads and voting</h2>
        <p>
          These happen on the NEAR blockchain. The app reads public chain data and asks your wallet to sign
          transactions. It doesn&apos;t store anything about them itself, but everything on-chain is public and
          permanent.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Alerts</h2>
        <p>
          If you sign up on <Link href="/alerts" className="text-frog hover:underline">Alerts</Link>, we store your
          NEAR account name, your phone number, and when you signed up or last changed it. They&apos;re kept in a
          Supabase database that only this app&apos;s server and its maintainers can read. Your number is never shown to other
          holders or on the page.
        </p>
        <p>
          To prove the wallet is yours, your wallet signs a message naming your number. The server checks the
          signature and doesn&apos;t keep it.
        </p>
        <p>
          Alerts are texted through msgbubbles, which receives your number and each alert&apos;s text to deliver it.
        </p>
        <p>
          When you <Link href="/send-alerts" className="text-frog hover:underline">send an alert</Link>, we keep its
          text, your account name, the time and how many holders it went to, to enforce the daily limit and look into
          abuse. Recipients see the text and your account name, never your phone number.
        </p>
        <p>
          You can delete your number at any time with &quot;Stop alerts and delete my number&quot; on the Alerts page,
          even after you no longer hold a CTOad, or without a wallet on the{" "}
          <Link href="/alerts/remove" className="text-frog hover:underline">
            remove page
          </Link>
          , linked at the end of every alert.
        </p>
      </section>
    </article>
  );
}
