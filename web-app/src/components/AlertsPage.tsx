"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { AlertsPitch } from "@/components/AlertsPitch";
import { errorText } from "@/components/TradeFields";
import { useOwnedCtoads } from "@/hooks/useCto";
import { MSGBUBBLES_NUMBER } from "@/config";
import {
  alertsApi,
  type AlertsStatus,
  CHANNELS,
  type Channels,
  channelsAction,
  emailAction,
  normalizeEmail,
  normalizePhone,
  signAlertsAction,
  STOP_EMAIL_ACTION,
  subscribeAction,
  UNSUBSCRIBE_ACTION,
} from "@/lib/alerts";

const CHANNEL_LABELS: Record<Channels, string> = { text: "Text", email: "Email", both: "Both" };

export function AlertsPage() {
  const { signedAccountId, signIn, signMessage } = useWalletSelector();
  const { data: tokens } = useOwnedCtoads(signedAccountId);
  const { data: status, error: statusError, mutate } = useSWR(
    signedAccountId ? ["alerts", signedAccountId] : null,
    () => alertsApi<AlertsStatus>("GET", "", { query: `?account=${encodeURIComponent(signedAccountId!)}` }),
  );
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedAccountId) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 py-8 text-center">
        <AlertsPitch title="Alerts" />
        <p className="text-white/60">Connect the wallet that holds your CTOad to sign up for alerts by text or email.</p>
        <button onClick={() => signIn()} className="rounded-xl bg-frog px-5 py-3 font-semibold text-black">
          Connect wallet
        </button>
      </div>
    );
  }

  const normalized = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  const holder = (tokens?.length ?? 0) > 0;

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await mutate();
      setMessage(done);
      setPhone("");
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const subscribe = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, subscribeAction(normalized!));
      return alertsApi("POST", "", { body: { proof, phone: normalized } });
    }, `Saved. Texts go to ${normalized}.`);

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

  const inputClass = "mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none";
  const buttonClass = "w-full rounded-xl bg-frog px-5 py-2 font-semibold text-black disabled:opacity-40";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <AlertsPitch title="Alerts" />
      <div className="mx-auto max-w-md space-y-6">

      {statusError ? (
        <p className="rounded-xl bg-white/5 p-4 text-sm text-white/70">Alerts aren&apos;t available right now.</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-white/10 bg-panel p-4">
          <p className="text-sm">
            {!status
              ? "Loading…"
              : status.subscribed
                ? `You're signed up. Alerts go by ${
                    !status.textEnabled ? "email" : status.channels === "both" ? "text and email" : status.channels
                  }.`
                : "You're not signed up yet."}
            {MSGBUBBLES_NUMBER && status?.textEnabled && (
              <span className="text-white/50"> Texts come from {MSGBUBBLES_NUMBER}.</span>
            )}
          </p>

          {tokens && !holder ? (
            <p className="text-sm text-white/60">Only CTOad holders can sign up. This wallet holds none.</p>
          ) : status?.textEnabled === false ? (
            <p className="text-sm text-white/60">Alerts go by email for now. Add your email below.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                subscribe();
              }}
              className="space-y-2"
            >
              <label className="block">
                <span className="text-xs text-white/50">
                  {status?.hasPhone ? "New phone number" : "Phone number"}, with country code
                </span>
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="+1 202 555 0123"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !normalized || !holder}
                className="w-full rounded-xl bg-frog px-5 py-2 font-semibold text-black disabled:opacity-40"
              >
                {busy ? "Confirm in your wallet…" : status?.hasPhone ? "Change number" : "Get alerts by text"}
              </button>
            </form>
          )}

          {holder && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (codeSentTo) verifyCode();
                else sendCode();
              }}
              className="space-y-2 border-t border-white/10 pt-4"
            >
              {codeSentTo ? (
                <label className="block">
                  <span className="text-xs text-white/50">The 6-digit code we emailed to {codeSentTo}</span>
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
                  <span className="text-xs text-white/50">{status?.hasEmail ? "New email" : "Email"}</span>
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
                <button type="button" onClick={() => setCodeSentTo(null)} className="text-xs text-white/50 hover:text-white">
                  Use a different email
                </button>
              )}
            </form>
          )}

          <p className="text-xs text-white/40">
            Your wallet asks you to sign a short message for each change. It proves the wallet is yours and costs
            nothing.
          </p>

          {status?.subscribed && (
            <div className="space-y-2 border-t border-white/10 pt-4">
              {status.textEnabled && (
                <>
                  <p className="text-xs text-white/50">Send my alerts by</p>
                  <div className="grid grid-cols-3 gap-2">
                    {CHANNELS.map((c) => {
                      const possible = c === "both" ? status.hasPhone && status.hasEmail : c === "text" ? status.hasPhone : status.hasEmail;
                      return (
                        <button
                          key={c}
                          onClick={() => setChannels(c)}
                          disabled={busy || !possible || status.channels === c}
                          className={`rounded-lg px-3 py-1.5 text-sm disabled:cursor-default ${
                            status.channels === c ? "bg-frog font-semibold text-black" : "bg-white/10 disabled:opacity-40"
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
                  <button onClick={removeEmail} disabled={busy} className="text-sm text-white/50 hover:text-white disabled:opacity-40">
                    Delete my email
                  </button>
                )}
                <button onClick={unsubscribe} disabled={busy} className="text-sm text-white/50 hover:text-white disabled:opacity-40">
                  Stop all alerts and delete my details
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {message && <p className="text-sm text-white/70">{message}</p>}

      {holder && (
        <Link href="/send-alerts" className="block text-sm text-white/60 hover:text-frog">
          Send an alert to your fellow holders →
        </Link>
      )}

      <Link href="/alerts/remove" className="block text-xs text-white/40 hover:text-white">
        Getting alerts you didn&apos;t sign up for? Remove your number
      </Link>
      </div>
    </div>
  );
}
