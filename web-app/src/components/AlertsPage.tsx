"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useState } from "react";
import useSWR from "swr";

import { errorText } from "@/components/TradeFields";
import { useOwnedCtoads } from "@/hooks/useCto";
import { normalizePhone, signAlertsAction, subscribeAction, UNSUBSCRIBE_ACTION } from "@/lib/alerts";

/** Calls /api/alerts and returns its JSON, or throws its error message. */
async function alertsApi(method: string, init?: { query?: string; body?: object }): Promise<{ subscribed: boolean }> {
  const res = await fetch(`/api/alerts${init?.query ?? ""}`, {
    method,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export function AlertsPage() {
  const { signedAccountId, signIn, signMessage } = useWalletSelector();
  const { data: tokens } = useOwnedCtoads(signedAccountId);
  const { data: status, error: statusError, mutate } = useSWR(
    signedAccountId ? ["alerts", signedAccountId] : null,
    () => alertsApi("GET", { query: `?account=${encodeURIComponent(signedAccountId!)}` }),
  );
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedAccountId) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-3xl font-bold">Alerts</h1>
        <p className="mt-2 text-white/60">Connect the wallet that holds your CTOad to sign up for alerts by text.</p>
        <button onClick={() => signIn()} className="mt-6 rounded-xl bg-frog px-5 py-3 font-semibold text-black">
          Connect wallet
        </button>
      </div>
    );
  }

  const normalized = normalizePhone(phone);
  const holder = (tokens?.length ?? 0) > 0;

  const run = async (work: () => Promise<{ subscribed: boolean }>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await mutate(await work(), { revalidate: false });
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
      return alertsApi("POST", { body: { proof, phone: normalized } });
    }, `Signed up. Alerts go to ${normalized}.`);

  const unsubscribe = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, UNSUBSCRIBE_ACTION);
      return alertsApi("DELETE", { body: { proof } });
    }, "Alerts stopped, and your number is deleted.");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Alerts</h1>
        <p className="mt-1 text-white/60">
          CTOad holders can sign up with a phone number to get alerts from fellow holders. Your number is never shown to
          other holders.
        </p>
      </div>

      {statusError ? (
        <p className="rounded-xl bg-white/5 p-4 text-sm text-white/70">Alerts aren&apos;t available right now.</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-white/10 bg-panel p-4">
          <p className="text-sm">
            {!status ? "Loading…" : status.subscribed ? "You're signed up for alerts." : "You're not signed up yet."}
          </p>

          {tokens && !holder ? (
            <p className="text-sm text-white/60">Only CTOad holders can sign up. This wallet holds none.</p>
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
                  {status?.subscribed ? "New phone number" : "Phone number"}, with country code
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
                {busy ? "Confirm in your wallet…" : status?.subscribed ? "Change number" : "Sign up"}
              </button>
              <p className="text-xs text-white/40">
                Your wallet asks you to sign a message naming this number. It proves the wallet is yours and costs
                nothing.
              </p>
            </form>
          )}

          {status?.subscribed && (
            <button
              onClick={unsubscribe}
              disabled={busy}
              className="text-sm text-white/50 hover:text-white disabled:opacity-40"
            >
              Stop alerts and delete my number
            </button>
          )}
        </div>
      )}

      {message && <p className="text-sm text-white/70">{message}</p>}
    </div>
  );
}
