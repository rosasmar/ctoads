"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { errorText } from "@/components/TradeFields";
import { MSGBUBBLES_NUMBER } from "@/config";
import { useOwnedCtoads } from "@/hooks/useCto";
import { signAlertsAction } from "@/lib/alerts";
import { HELP_TEXT, LINK_TEXTS_ACTION, type TextsStatus, UNLINK_TEXTS_ACTION } from "@/lib/texts";

async function textsApi<T>(method: string, init?: { query?: string; body?: object }): Promise<T> {
  const res = await fetch(`/api/texts${init?.query ?? ""}`, {
    method,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Link your phone by texting a code to the app's number, then run your CTOad by text. */
export function TextsPage() {
  const { signedAccountId, signIn, signMessage } = useWalletSelector();
  const { data: tokens } = useOwnedCtoads(signedAccountId);
  const [code, setCode] = useState<string | null>(null);
  // While a code is waiting, check every few seconds whether it was texted.
  const { data: status, mutate } = useSWR(
    signedAccountId ? ["texts", signedAccountId] : null,
    () => textsApi<TextsStatus>("GET", { query: `?account=${encodeURIComponent(signedAccountId!)}` }),
    { refreshInterval: code ? 3000 : 0 },
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const holder = (tokens?.length ?? 0) > 0;
  const showCode = code && !status?.linked;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await mutate();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const getCode = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, LINK_TEXTS_ACTION);
      const { code } = await textsApi<{ code: string }>("POST", { body: { proof } });
      setCode(code);
    });

  const unlink = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, UNLINK_TEXTS_ACTION);
      await textsApi("DELETE", { body: { proof } });
      setCode(null);
      setMessage("Unlinked. Texts from your number won't change anything anymore.");
    });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-4xl">Text your toad</h1>
        <p className="mt-2 text-ink/80">
          Link your phone once, then text {MSGBUBBLES_NUMBER || "our number"} to get the price, a link that opens a
          trade in your wallet, or a top-up from another chain. CTOad holders also run their profile and votes by text.
          Nothing is ever bought, sold or voted by text alone.
        </p>
      </div>

      {!signedAccountId ? (
        <button onClick={() => signIn()} className="press rounded-xl bg-accent px-5 py-3 font-bold">
          Connect wallet
        </button>
      ) : (
        <>
        {tokens && !holder && (
          <p className="border border-ink bg-ink/5 p-4 text-sm text-ink/80">
            This wallet doesn&apos;t hold a CTOad yet. You can still link it to buy, sell and top up by text. Profiles and
            votes are for holders.
          </p>
        )}
        <section className="space-y-4 rounded-2xl border-2 border-ink bg-card p-5 shadow-hard">
          {status?.linked ? (
            <p className="font-bold text-frog">Your number is linked. Text HELP to {MSGBUBBLES_NUMBER} to start.</p>
          ) : showCode ? (
            <div className="space-y-3">
              <p>From your phone, text this to {MSGBUBBLES_NUMBER}:</p>
              <p className="font-display text-center text-3xl">LINK {code}</p>
              <a
                href={`sms:${MSGBUBBLES_NUMBER}&body=${encodeURIComponent(`LINK ${code}`)}`}
                className="press block rounded-xl bg-accent py-3 text-center font-bold"
              >
                Open Messages
              </a>
              <p className="text-xs text-ink/65">The code works for 15 minutes. This page updates once it arrives.</p>
            </div>
          ) : (
            <button onClick={getCode} disabled={busy} className="press w-full rounded-xl bg-accent py-3 font-bold disabled:opacity-40">
              {busy ? "Confirm in your wallet…" : "Get my code"}
            </button>
          )}
          {status?.linked && (
            <button onClick={unlink} disabled={busy} className="text-sm text-ink/65 hover:text-ink disabled:opacity-40">
              Unlink my number
            </button>
          )}
        </section>
        </>
      )}

      {message && <p className="text-sm text-ink/80">{message}</p>}

      <section className="space-y-2">
        <h2 className="text-xl">Commands</h2>
        <pre className="overflow-x-auto rounded-xl border-2 border-ink bg-card p-4 font-mono text-sm whitespace-pre-wrap">{HELP_TEXT}</pre>
        <p className="text-sm text-ink/65">
          Profile changes and votes need you to hold a CTOad, like on the{" "}
          <Link href="/profile" className="underline">
            Profile
          </Link>{" "}
          page. Each number gets at most 20 replies an hour.
        </p>
      </section>
    </div>
  );
}
