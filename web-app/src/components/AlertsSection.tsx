"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { errorText } from "@/components/TradeFields";
import { useOwnedCtoads } from "@/hooks/useCto";
import { useTextEnabled } from "@/hooks/useTextEnabled";
import { MSGBUBBLES_NUMBER } from "@/config";
import {
  alertsApi,
  type AlertsStatus,
  CHANNELS,
  type Channels,
  channelsAction,
  emailAction,
  normalizeEmail,
  signAlertsAction,
  STOP_EMAIL_ACTION,
  SUBSCRIBE_TEXT_ACTION,
  UNSUBSCRIBE_ACTION,
} from "@/lib/alerts";

const CHANNEL_LABELS: Record<Channels, string> = { text: "Text", email: "Email", both: "Both" };

/**
 * Signing up for alerts, on the phone page under linking your phone. Text alerts go to that linked
 * number, so there's no number to type here; email has its own code. Needs a connected wallet.
 */
export function AlertsSection({ linked }: { linked: boolean }) {
  const { signedAccountId, signMessage } = useWalletSelector();
  const textEnabled = useTextEnabled();
  const { data: tokens } = useOwnedCtoads(signedAccountId);
  const { data: status, error: statusError, mutate } = useSWR(
    signedAccountId ? ["alerts", signedAccountId] : null,
    () => alertsApi<AlertsStatus>("GET", "", { query: `?account=${encodeURIComponent(signedAccountId!)}` }),
  );
  const [email, setEmail] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedAccountId) return null;

  const normalizedEmail = normalizeEmail(email);
  const holder = (tokens?.length ?? 0) > 0;

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await mutate();
      setMessage(done);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const subscribe = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, SUBSCRIBE_TEXT_ACTION);
      return alertsApi("POST", "", { body: { proof } });
    }, "Saved. Alerts go to your linked number.");

  const sendCode = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, emailAction(normalizedEmail!));
      await alertsApi("POST", "/email", { body: { proof, email: normalizedEmail } });
      setCodeSentTo(normalizedEmail);
      setEmail("");
    }, `We emailed a code to ${normalizedEmail}. Enter it below.`);

  const verifyCode = () =>
    run(async () => {
      await alertsApi("PUT", "/email", { body: { accountId: signedAccountId, code } });
      setCodeSentTo(null);
      setCode("");
    }, "Email verified. Alerts can go there now.");

  const removeEmail = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, STOP_EMAIL_ACTION);
      return alertsApi("DELETE", "/email", { body: { proof } });
    }, "Email alerts stopped, and your address is deleted.");

  const setChannels = (channels: Channels) =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, channelsAction(channels));
      return alertsApi("PATCH", "", { body: { proof, channels } });
    }, `Alerts now go by ${channels === "both" ? "text and email" : channels}.`);

  const unsubscribe = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, UNSUBSCRIBE_ACTION);
      return alertsApi("DELETE", "", { body: { proof } });
    }, "All alerts stopped, and your details are deleted.");

  const inputClass = "mt-1 w-full rounded-xl border-2 border-ink bg-white px-3 py-2 outline-none";
  const buttonClass = "w-full rounded-xl press bg-accent px-5 py-2 font-semibold text-ink disabled:opacity-40";

  return (
    <div className="space-y-4">

      {statusError ? (
        <p className="rounded-xl bg-ink/5 p-4 text-sm text-ink/80">Alerts aren&apos;t available right now.</p>
      ) : (
        <div className="space-y-4 rounded-xl border-2 border-ink bg-card p-4">
          <p className="text-sm">
            {!status
              ? "Loading…"
              : status.subscribed
                ? `You're signed up. Alerts go by ${
                    !status.textEnabled ? "email" : status.channels === "both" ? "text and email" : status.channels
                  }.`
                : "You're not signed up yet."}
            {MSGBUBBLES_NUMBER && status?.textEnabled && (
              <span className="text-ink/65"> Texts come from {MSGBUBBLES_NUMBER}.</span>
            )}
          </p>

          {tokens && !holder ? (
            <p className="text-sm text-ink/65">Only CTOad holders can sign up. This wallet holds none.</p>
          ) : status?.textEnabled === false ? (
            <p className="text-sm text-ink/65">Alerts go by email for now. Add your email below.</p>
          ) : status?.hasPhone ? (
            <p className="text-sm text-ink/65">Text alerts are on. They go to your linked number.</p>
          ) : !linked ? (
            <p className="text-sm text-ink/65">Link your phone above to get alerts by text.</p>
          ) : (
            <button onClick={subscribe} disabled={busy || !holder} className={buttonClass}>
              {busy ? "Confirm in your wallet…" : "Get alerts by text"}
            </button>
          )}

          {holder && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (codeSentTo) verifyCode();
                else sendCode();
              }}
              className="space-y-2 border-t border-ink/15 pt-4"
            >
              {codeSentTo ? (
                <label className="block">
                  <span className="text-xs text-ink/65">The 6-digit code we emailed to {codeSentTo}</span>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className={inputClass}
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="text-xs text-ink/65">{status?.hasEmail ? "New email" : "Email"}</span>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </label>
              )}
              <button
                type="submit"
                disabled={busy || (codeSentTo ? code.length !== 6 : !normalizedEmail)}
                className={buttonClass}
              >
                {busy ? "One moment…" : codeSentTo ? "Verify email" : status?.hasEmail ? "Change email" : "Get alerts by email"}
              </button>
              {codeSentTo && (
                <button type="button" onClick={() => setCodeSentTo(null)} className="text-xs text-ink/65 hover:text-ink">
                  Use a different email
                </button>
              )}
            </form>
          )}

          <p className="text-xs text-ink/65">
            Your wallet asks you to sign a short message for each change. It proves the wallet is yours and costs
            nothing.
          </p>

          {status?.subscribed && (
            <div className="space-y-2 border-t border-ink/15 pt-4">
              {status.textEnabled && (
                <>
                  <p className="text-xs text-ink/65">Send my alerts by</p>
                  <div className="grid grid-cols-3 gap-2">
                    {CHANNELS.map((c) => {
                      const possible = c === "both" ? status.hasPhone && status.hasEmail : c === "text" ? status.hasPhone : status.hasEmail;
                      return (
                        <button
                          key={c}
                          onClick={() => setChannels(c)}
                          disabled={busy || !possible || status.channels === c}
                          className={`rounded-lg px-3 py-1.5 text-sm disabled:cursor-default ${
                            status.channels === c ? "bg-accent font-semibold text-ink" : "bg-ink/10 disabled:opacity-40"
                          }`}
                        >
                          {CHANNEL_LABELS[c]}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
                {status.hasEmail && (
                  <button onClick={removeEmail} disabled={busy} className="text-sm text-ink/65 hover:text-ink disabled:opacity-40">
                    Delete my email
                  </button>
                )}
                <button onClick={unsubscribe} disabled={busy} className="text-sm text-ink/65 hover:text-ink disabled:opacity-40">
                  Stop all alerts and delete my details
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {message && <p className="text-sm text-ink/80">{message}</p>}

      {holder && (
        <Link href="/send-alerts" className="block text-sm text-ink/65 hover:text-frog">
          Send an alert to your fellow holders →
        </Link>
      )}

      {textEnabled && (
        <Link href="/alerts/remove" className="block text-xs text-ink/65 hover:text-ink">
          Getting alerts you didn&apos;t sign up for? Remove your number
        </Link>
      )}
    </div>
  );
}
