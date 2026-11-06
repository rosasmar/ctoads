// Minimal NEAR JSON-RPC client, unit formatting and event parsing. No Node APIs, so it runs in
// the browser and on the server.

import { RPC_URL } from "@/config";

export const NEAR_DECIMALS = 24;
export const CTO_DECIMALS = 18;
export const YOCTO_PER_NEAR = 10n ** 24n;
/** Storage price on NEAR: 10^19 yoctoNEAR per byte. */
export const STORAGE_BYTE_COST = 10n ** 19n;

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "cto", method, params }),
  });
  if (!res.ok) throw new Error(`RPC request failed (${res.status})`);
  const json = await res.json();
  if (json.error) {
    const cause = json.error.cause?.name ? `${json.error.cause.name}: ` : "";
    throw new Error(cause + (json.error.data ?? json.error.message ?? "RPC error"));
  }
  return json.result as T;
}

function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Calls a view method and parses its JSON result. */
export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const result = await rpc<{ result?: number[]; error?: string }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: contractId,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  });
  if (result.error) throw new Error(result.error);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result ?? []))) as T;
}

export type AccountView = { amount: string; locked: string; storage_usage: number; code_hash: string };

/** Account balance and storage, or null if the account doesn't exist. */
export async function viewAccount(accountId: string): Promise<AccountView | null> {
  try {
    return await rpc<AccountView>("query", {
      request_type: "view_account",
      finality: "optimistic",
      account_id: accountId,
    });
  } catch (e) {
    if (String(e).includes("UNKNOWN_ACCOUNT") || String(e).includes("does not exist")) return null;
    throw e;
  }
}

/** NEAR an account can spend: its balance minus what its storage locks up. */
export function availableBalance(account: AccountView): bigint {
  const free = BigInt(account.amount) - BigInt(account.storage_usage) * STORAGE_BYTE_COST;
  return free > 0n ? free : 0n;
}

export type ExecutionOutcome = {
  transaction_outcome?: { outcome: { logs: string[] } };
  receipts_outcome?: { outcome: { logs: string[] } }[];
};

/** Looks up a finished transaction, e.g. after a wallet redirects back with ?transactionHashes=. */
export function txStatus(hash: string, senderId: string): Promise<ExecutionOutcome> {
  return rpc<ExecutionOutcome>("tx", {
    tx_hash: hash,
    sender_account_id: senderId,
    wait_until: "EXECUTED_OPTIMISTIC",
  });
}

export type NearEvent = { standard: string; version: string; event: string; data: Record<string, unknown>[] };

/** Every NEP-297 event (`EVENT_JSON:` log) emitted anywhere in a transaction. */
export function eventsFrom(outcome: unknown): NearEvent[] {
  const o = outcome as ExecutionOutcome | undefined;
  const logs = [
    ...(o?.transaction_outcome?.outcome.logs ?? []),
    ...(o?.receipts_outcome ?? []).flatMap((r) => r.outcome.logs),
  ];
  return logs.flatMap((log) => {
    if (!log.startsWith("EVENT_JSON:")) return [];
    try {
      return [JSON.parse(log.slice("EVENT_JSON:".length)) as NearEvent];
    } catch {
      return [];
    }
  });
}

/**
 * Formats an integer amount of base units. Shows up to `maxFraction` decimals, but for values
 * under 1 keeps at least `minSignificant` significant digits so tiny prices don't round to 0.
 */
export function formatUnits(value: bigint | string, decimals: number, maxFraction = 4, minSignificant = 2): string {
  const v = BigInt(value);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0");

  let digits = maxFraction;
  if (whole === 0n && abs > 0n) {
    const firstNonZero = fraction.search(/[1-9]/);
    digits = Math.max(maxFraction, firstNonZero + minSignificant);
  }
  const shown = fraction.slice(0, digits).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${shown ? `.${shown}` : ""}`;
}

/** Parses a decimal string like "1.5" into base units. Returns null if it isn't a number. */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, fraction = ""] = s.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export const formatNear = (yocto: bigint | string, maxFraction = 4) => formatUnits(yocto, NEAR_DECIMALS, maxFraction);
export const formatCto = (amount: bigint | string, maxFraction = 2) => formatUnits(amount, CTO_DECIMALS, maxFraction);
export const parseNear = (input: string) => parseUnits(input, NEAR_DECIMALS);
export const parseCto = (input: string) => parseUnits(input, CTO_DECIMALS);

export function shortAccount(accountId: string, keep = 10): string {
  return accountId.length > keep * 2 + 1 ? `${accountId.slice(0, keep)}…${accountId.slice(-keep)}` : accountId;
}
