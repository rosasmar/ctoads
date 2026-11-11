import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · CTOads" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-ink/80 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink">
      <div>
        <h1 className="text-3xl font-bold text-ink">Privacy</h1>
        <p className="mt-1 text-sm text-ink/65">What this app stores about you, and how to delete it. See also the <Link href="/terms" className="text-frog hover:underline">terms</Link>.</p>
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
          NEAR account name, the phone number and/or email address you add, whether alerts go by text, email or
          both, and when you signed up or last changed it. They&apos;re kept in a
          Supabase database that only this app&apos;s server and its maintainers can read. Your number and address are never shown to
          other holders or on the page.
        </p>
        <p>
          To prove the wallet is yours, your wallet signs a message naming your number. The server checks the
          signature and doesn&apos;t keep it.
        </p>
        <p>
          Alerts are texted through msgbubbles and emailed through Resend, which receive your number or address and
          each alert to deliver it. To verify an email, Resend sends it a code. We keep only a hash of the code, for 10
          minutes. Before an alert is sent, its text and image go to OpenAI&apos;s moderation service to check for harmful content.
        </p>
        <p>
          When you <Link href="/send-alerts" className="text-frog hover:underline">send an alert</Link>, we keep its
          text, any image (in an Amazon S3 bucket), your account name, the time and how many holders it went to, to enforce the daily limit and look into
          abuse. Recipients see the text and your account name, never your phone number.
        </p>
        <p>
          You can delete your number at any time with &quot;Stop alerts and delete my number&quot; on the Alerts page,
          even after you no longer hold a CTOad, or without a wallet on the{" "}
          <Link href="/alerts/remove" className="text-frog hover:underline">
            remove page
          </Link>
          , linked at the end of every text. You can delete just your email on the Alerts page too.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Profiles</h2>
        <p>
          If you make a <Link href="/profile" className="text-frog hover:underline">profile</Link>, we store your NEAR
          account name, the handle, bio and links you enter, and when you made or last changed it, in the same Supabase
          database. Your profile is public: anyone can see it at ctoads.xyz/@yourhandle, together with your account
          name and the CTOads it holds.
        </p>
        <p>
          Before a profile is saved, its handle, bio and link names go to OpenAI&apos;s moderation service. Your wallet
          signs each change; the signature isn&apos;t kept. You can delete your profile at any time on the Profile page,
          even after you no longer hold a CTOad.
        </p>
      </section>
    </article>
  );
}
