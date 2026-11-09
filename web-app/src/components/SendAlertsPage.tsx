"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { AlertsPitch } from "@/components/AlertsPitch";
import { errorText } from "@/components/TradeFields";
import { useOwnedCtoads } from "@/hooks/useCto";
import {
  alertsApi,
  alertText,
  IMAGE_TYPES,
  MAX_ALERT_LENGTH,
  MAX_IMAGE_BYTES,
  REMOVE_PATH,
  sendAction,
  sha256Hex,
  signAlertsAction,
} from "@/lib/alerts";

export function SendAlertsPage() {
  const { signedAccountId, signIn, signMessage } = useWalletSelector();
  const { data: tokens } = useOwnedCtoads(signedAccountId);
  const { data: limit, mutate } = useSWR(signedAccountId ? ["alerts-remaining", signedAccountId] : null, () =>
    alertsApi<{ remaining: number }>("GET", "/send", { query: `?account=${encodeURIComponent(signedAccountId!)}` }),
  );
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  // Bumped after sending to clear the file input, which React can't set directly.
  const [fileInputKey, setFileInputKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedAccountId) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 py-8 text-center">
        <AlertsPitch title="Send an alert" />
        <p className="text-white/60">Connect the wallet that holds your CTOad to text your fellow holders.</p>
        <button onClick={() => signIn()} className="rounded-xl bg-frog px-5 py-3 font-semibold text-black">
          Connect wallet
        </button>
      </div>
    );
  }

  const trimmed = text.trim();
  const holder = (tokens?.length ?? 0) > 0;
  const imageError =
    image && !(image.type in IMAGE_TYPES)
      ? "Attach a JPEG, PNG, GIF or WebP image."
      : image && image.size > MAX_IMAGE_BYTES
        ? `Images can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`
        : null;
  const canSend =
    holder && trimmed.length > 0 && trimmed.length <= MAX_ALERT_LENGTH && !imageError && limit?.remaining !== 0;

  const send = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // One signature covers the text and the image's hash. It's used to get an upload URL, then to send.
      const sha256 = image ? await sha256Hex(await image.arrayBuffer()) : undefined;
      const proof = await signAlertsAction(signMessage, sendAction(trimmed, sha256));
      if (image) {
        const { url } = await alertsApi<{ url: string }>("POST", "/upload", {
          body: { proof, text: trimmed, image: { sha256, type: image.type, size: image.size } },
        });
        const upload = await fetch(url, { method: "PUT", headers: { "Content-Type": image.type }, body: image });
        if (!upload.ok) throw new Error("The image didn't upload. Please try again.");
      }
      const result = await alertsApi<{ sent: number; failed: number; remaining: number }>("POST", "/send", {
        body: { proof, text: trimmed, image: image ? { sha256, type: image.type } : undefined },
      });
      await mutate({ remaining: result.remaining }, { revalidate: false });
      setText("");
      setImage(null);
      setFileInputKey((k) => k + 1);
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
    <div className="mx-auto max-w-3xl space-y-8">
      <AlertsPitch title="Send an alert" />
      <div className="mx-auto max-w-md space-y-6">

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
          <label className="block text-xs text-white/50">
            Image (optional, up to {MAX_IMAGE_BYTES / 1024 / 1024} MB)
            <input
              key={fileInputKey}
              type="file"
              accept={Object.keys(IMAGE_TYPES).join(",")}
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
            />
          </label>
          {imageError && <p className="text-xs text-red-400">{imageError}</p>}
          {trimmed && (
            <p className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-white/60">
              {alertText(trimmed, signedAccountId, `${window.location.origin}${REMOVE_PATH}`)}
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
            message, which costs nothing. Follow the{" "}
            <Link href="/terms" className="text-white/60 hover:text-frog">
              terms
            </Link>
            .
          </p>
        </form>
      )}

      {message && <p className="text-sm text-white/70">{message}</p>}
      </div>
    </div>
  );
}
