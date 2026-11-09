"use client";

import Link from "next/link";
import { useState } from "react";

import { errorText } from "@/components/TradeFields";
import { alertsApi, normalizePhone } from "@/lib/alerts";

export function RemoveNumberPage() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const normalized = normalizePhone(phone);

  const remove = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await alertsApi("POST", "/remove", { body: { phone: normalized } });
      setMessage(`Done. If ${normalized} was signed up, it's removed and won't get alerts.`);
      setPhone("");
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Stop alerts to your number</h1>
        <p className="mt-1 text-white/60">
          Getting CTOads alerts you didn&apos;t sign up for, or don&apos;t want anymore? Enter your number and
          we&apos;ll delete it. No wallet needed.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          remove();
        }}
        className="space-y-2 rounded-xl border border-white/10 bg-panel p-4"
      >
        <label className="block">
          <span className="text-xs text-white/50">Phone number, with country code</span>
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
          disabled={busy || !normalized}
          className="w-full rounded-xl bg-frog px-5 py-2 font-semibold text-black disabled:opacity-40"
        >
          {busy ? "Removing…" : "Remove my number"}
        </button>
      </form>
      {message && <p className="text-sm text-white/70">{message}</p>}
      <p className="text-xs text-white/40">
        CTOad holders can also manage alerts with their wallet on{" "}
        <Link href="/alerts" className="hover:text-white">
          Alerts
        </Link>
        .
      </p>
    </div>
  );
}
