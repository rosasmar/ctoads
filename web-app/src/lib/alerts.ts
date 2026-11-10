// What a wallet signs to use alerts, shared by the browser (which asks the wallet to sign) and the
// server (which rebuilds the same text and checks the signature, in lib/walletProof.ts).

import type { SignedMessage, SignMessageParams } from "@near-wallet-selector/core";
import { Buffer } from "buffer";
import { NFT_CONTRACT } from "@/config";

/** Who the signed message is for (NEP-413's `recipient`), so it can't be reused for another app. */
export const ALERTS_RECIPIENT = NFT_CONTRACT;

/** The message signed for `action`, e.g. "Send alerts to +12025550123". */
export function alertsMessage(action: string, signedAt: number): string {
  return `CTOads alerts\n${action}\nSigned at ${new Date(signedAt).toISOString()}`;
}

/** The actions a wallet signs. Including the number means a signature can't be reused for another one. */
export const subscribeAction = (phone: string) => `Send alerts to ${phone}`;
export const UNSUBSCRIBE_ACTION = "Stop alerts";
export const emailAction = (email: string) => `Send alerts by email to ${email}`;
export const STOP_EMAIL_ACTION = "Stop email alerts";
export const channelsAction = (channels: Channels) => `Get alerts by ${channels}`;

/** Where a subscriber's alerts go. */
export const CHANNELS = ["text", "email", "both"] as const;
export type Channels = (typeof CHANNELS)[number];

/** What /api/alerts says about an account. Never the number or address themselves. */
export type AlertsStatus = {
  subscribed: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  channels: Channels | null;
  /** False when the server has no msgbubbles key, so alerts only go by email. */
  textEnabled: boolean;
};

/** A lowercased email address, or null if it doesn't look like one. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
/** With an image, the signed text names its SHA-256, so the server can check it's the same file. */
export const sendAction = (text: string, imageSha256?: string) =>
  `Send this alert to every signed-up holder:\n${text}${imageSha256 ? `\nImage SHA-256: ${imageSha256}` : ""}`;

/** Image types an alert can carry, with their file extension, and the largest size allowed. */
export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" } as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The SHA-256 of a file, as hex. Works in the browser and on the server. */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Longest alert a holder can send, and how many each account can send in 24 hours. */
export const MAX_ALERT_LENGTH = 500;
export const DAILY_ALERT_LIMIT = 3;

/**
 * What each recipient gets: the alert, who sent it, and a link to stop. The number is outbound
 * only, so replies (like STOP) never reach us.
 */
export const alertText = (text: string, from: string, removeUrl: string) =>
  `${text}\n\n- ${from}, a CTOad holder. Stop these alerts: ${removeUrl}`;

/** The page where anyone can remove their number, wallet or not. */
export const REMOVE_PATH = "/alerts/remove";

/** The same for email: emails stop on the Alerts page, where the address can be deleted. */
export const alertEmailText = (text: string, from: string, alertsUrl: string) =>
  `${text}\n\n- ${from}, a CTOad holder\n\nDon't want these anymore? You can turn off email alerts anytime on the Alerts page: ${alertsUrl}`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The HTML version: a small label, then the alert large and bold. Everything a holder wrote is escaped. */
export const alertEmailHtml = (text: string, from: string, alertsUrl: string) => `<div style="font-family:system-ui,sans-serif;max-width:560px">
<p style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#16a34a;margin:0 0 8px">CTOad alert</p>
<p style="font-size:22px;font-weight:700;line-height:1.35;margin:0 0 12px;white-space:pre-wrap">${escapeHtml(text)}</p>
<p style="font-size:14px;color:#6b7280;margin:0 0 32px">${escapeHtml(from)}, a CTOad holder</p>
<p style="font-size:13px;color:#9ca3af;margin:0">Don't want these anymore? You can turn off email alerts anytime on the <a href="${escapeHtml(alertsUrl)}" style="color:#16a34a">Alerts page</a>.</p>
</div>`;

/**
 * A phone number in international format (+ country code, 8–15 digits), with spaces, dashes,
 * dots and brackets removed. Null if it doesn't look like one.
 */
export function normalizePhone(input: string): string | null {
  const phone = input.replace(/[\s\-.()]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

/** A signed message the server checks, sent along with each alerts request. */
export type WalletProof = {
  accountId: string;
  publicKey: string;
  /** base64 */
  signature: string;
  /** base64, 32 random bytes */
  nonce: string;
  /** milliseconds since 1970, as in the message */
  signedAt: number;
  /** The page's address. Some wallets sign it too (NEP-413's `callbackUrl`). */
  callbackUrl: string;
};

/** Asks the connected wallet to sign `action`. Wallets that redirect instead of opening a popup return nothing. */
export async function signAlertsAction(
  signMessage: (params: SignMessageParams) => Promise<SignedMessage | void>,
  action: string,
): Promise<WalletProof> {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
  const signedAt = Date.now();
  const callbackUrl = window.location.href;
  const message = alertsMessage(action, signedAt);
  const signed = await signMessage({ message, recipient: ALERTS_RECIPIENT, nonce, callbackUrl });
  if (!signed) throw new Error("This wallet didn't return a signature. Try Meteor, Intear or HERE.");
  return { ...signed, nonce: nonce.toString("base64"), signedAt, callbackUrl };
}

/** Calls /api/alerts`path` from the browser and returns its JSON, or throws its error message. */
export async function alertsApi<T>(method: string, path: string, init?: { query?: string; body?: object }): Promise<T> {
  const res = await fetch(`/api/alerts${path}${init?.query ?? ""}`, {
    method,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}
