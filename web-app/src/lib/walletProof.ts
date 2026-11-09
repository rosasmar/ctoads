// Checks a WalletProof on the server: the signature is valid (NEP-413), the key belongs to the
// account, and (for `verifyHolder`) the account holds a CTOad.

import "server-only";
import { PublicKey } from "@near-js/crypto";
import { serialize } from "borsh";
import { ALERTS_RECIPIENT, alertsMessage, type WalletProof } from "@/lib/alerts";
import { nftTokensForOwner } from "@/lib/cto";
import { isFullAccessKey } from "@/lib/near";

/** How long a signature stays usable. */
const MAX_AGE_MS = 5 * 60 * 1000;
/** NEP-413's tag, 2^31 + 413, written before the message so it can't be a valid transaction. */
const NEP413_TAG = 2 ** 31 + 413;
const NEP413_SCHEMA = {
  struct: {
    message: "string",
    nonce: { array: { type: "u8", len: 32 } },
    recipient: "string",
    callbackUrl: { option: "string" },
  },
} as const;

/** An error whose message is safe to show the user. */
export class ProofError extends Error {}

/** Most wallets sign without the page's address, MyNearWallet signs with it, so either is accepted. */
async function signatureIsValid(proof: WalletProof, message: string): Promise<boolean> {
  return (
    (await signatureMatches(proof, message, null)) ||
    (typeof proof.callbackUrl === "string" && (await signatureMatches(proof, message, proof.callbackUrl)))
  );
}

async function signatureMatches(proof: WalletProof, message: string, callbackUrl: string | null): Promise<boolean> {
  const nonce = Buffer.from(proof.nonce, "base64");
  if (nonce.length !== 32) return false;
  const params = serialize(NEP413_SCHEMA, { message, nonce, recipient: ALERTS_RECIPIENT, callbackUrl });
  const payload = new Uint8Array([...serialize("u32", NEP413_TAG), ...params]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
  try {
    return PublicKey.fromString(proof.publicKey).verify(hash, Buffer.from(proof.signature, "base64"));
  } catch {
    return false;
  }
}

/** Returns the account that signed `action`, or throws a ProofError if the signature can't be trusted. */
export async function verifySigner(proof: WalletProof, action: string): Promise<string> {
  const age = Date.now() - proof.signedAt;
  if (!(age >= -60_000 && age <= MAX_AGE_MS)) throw new ProofError("This signature has expired. Please sign again.");
  if (!(await signatureIsValid(proof, alertsMessage(action, proof.signedAt)))) {
    throw new ProofError("The signature doesn't match. Please sign again.");
  }
  if (!(await isFullAccessKey(proof.accountId, proof.publicKey))) {
    throw new ProofError(`That key doesn't belong to ${proof.accountId}.`);
  }
  return proof.accountId;
}

/** Like `verifySigner`, and also throws if the account holds no CTOad. */
export async function verifyHolder(proof: WalletProof, action: string): Promise<string> {
  await verifySigner(proof, action);
  if ((await nftTokensForOwner(proof.accountId)).length === 0) {
    throw new ProofError(`${proof.accountId} doesn't hold a CTOad.`);
  }
  return proof.accountId;
}
