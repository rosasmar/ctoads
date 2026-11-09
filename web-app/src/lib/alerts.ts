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
export const sendAction = (text: string) => `Send this alert to every signed-up holder:\n${text}`;

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
  /** The page's address. Some wallets, like MyNearWallet, sign it too (NEP-413's `callbackUrl`). */
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
  if (!signed) throw new Error("This wallet didn't return a signature. Try Meteor, Intear, HERE or MyNearWallet.");
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
