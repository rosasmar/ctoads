"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { errorText } from "@/components/TradeFields";
import { useOwnedCtoads } from "@/hooks/useCto";
import { alertsApi, alertText, MAX_ALERT_LENGTH, sendAction, signAlertsAction } from "@/lib/alerts";

export function SendAlertsPage() {
  const { signedAccountId, signIn, signMessage } = useWalletSelector();
  const { data: tokens } = useOwnedCtoads(signedAccountId);
  const { data: limit, mutate } = useSWR(signedAccountId ? ["alerts-remaining", signedAccountId] : null, () =>
    alertsApi<{ remaining: number }>("GET", "/send", { query: `?account=${encodeURIComponent(signedAccountId!)}` }),
  );
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedAccountId) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-3xl font-bold">Send an alert</h1>
        <p className="mt-2 text-white/60">Connect the wallet that holds your CTOad to text your fellow holders.</p>
        <button onClick={() => signIn()} className="mt-6 rounded-xl bg-frog px-5 py-3 font-semibold text-black">
          Connect wallet
        </button>
      </div>
    );
  }

  const trimmed = text.trim();
  const holder = (tokens?.length ?? 0) > 0;
  const canSend = holder && trimmed.length > 0 && trimmed.length <= MAX_ALERT_LENGTH && limit?.remaining !== 0;

  const send = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const proof = await signAlertsAction(signMessage, sendAction(trimmed));
      const result = await alertsApi<{ sent: number; failed: number; remaining: number }>("POST", "/send", {
        body: { proof, text: trimmed },
      });
      await mutate({ remaining: result.remaining }, { revalidate: false });
      setText("");
      setMessage(
        result.sent === 0 && result.failed === 0
          ? "Sent, but no other holder is signed up yet."
          : `Sent to ${result.sent} holder${result.sent === 1 ? "" : "s"}.${result.failed ? ` ${result.failed} couldn't be reached.` : ""}`,
      );
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Send an alert</h1>
        <p className="mt-1 text-white/60">
          Text every holder signed up on <Link href="/alerts" className="text-white/80 hover:text-frog">Alerts</Link>.
          It comes from the CTOads number, so they see your account name, never your phone number.
        </p>
      </div>

      {tokens && !holder ? (
        <p className="rounded-xl bg-white/5 p-4 text-sm text-white/60">Only CTOad holders can send alerts. This wallet holds none.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="space-y-3 rounded-xl border border-white/10 bg-panel p-4"
        >
          <label className="block">
            <span className="flex justify-between text-xs text-white/50">
              <span>Message</span>
              <span className={trimmed.length > MAX_ALERT_LENGTH ? "text-red-400" : ""}>
                {trimmed.length}/{MAX_ALERT_LENGTH}
              </span>
            </span>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Vote on proposal #3 before it closes tonight"
              className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
            />
          </label>
          {trimmed && (
            <p className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-white/60">
              {alertText(trimmed, signedAccountId)}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !canSend}
            className="w-full rounded-xl bg-frog px-5 py-2 font-semibold text-black disabled:opacity-40"
          >
            {busy ? "Confirm in your wallet…" : "Send to all signed-up holders"}
          </button>
          <p className="text-xs text-white/40">
            {limit ? `You can send ${limit.remaining} more today.` : "Checking today's limit…"} Your wallet signs the exact
            message, which costs nothing.
          </p>
        </form>
      )}

      {message && <p className="text-sm text-white/70">{message}</p>}
    </div>
  );
}
