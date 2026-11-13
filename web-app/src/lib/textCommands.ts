// What happens when someone texts the app's number (lib/texts.ts has the commands). Only a number
// linked to an account (by texting the code from /texts) can change anything, and changes to a
// profile still need that account to hold a CTOad. Trades are never made here: BUY and SELL only
// reply with a link that opens the trade in the holder's own wallet.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { NETWORK } from "@/config";
import { sha256Hex } from "@/lib/alerts";
import { ctoadClaimable, getMarket, getProposals, nftTokensForOwner } from "@/lib/cto";
import { STATUS_TEXT, TOPUP_ASSETS, type TopUpStatus, WNEAR_CONTRACT } from "@/lib/intents";
import { moderate } from "@/lib/moderation";
import { sendText } from "@/lib/msgbubbles";
import { formatNear, parseUnits, view } from "@/lib/near";
import { OneClickError, requestQuote, topUpStatus } from "@/lib/oneClick";
import { normalizeProfile, type Profile, profilePath } from "@/lib/profile";
import { removeNumberFromAlerts } from "@/lib/removeNumber";
import { supabase } from "@/lib/supabase";
import { type Command, HELP_TEXT, parseCommand, TEXTS_PATH, TOPUP_HELP_TEXT } from "@/lib/texts";

/** The bouncer's line: what a linked number without a CTOad gets for club-only commands. */
export const NOT_A_MEMBER =
  "Sorry, that's for CTOad holders only. Lose NEAR on a $CTO sell to earn a toad and join the club. Text BUY 1 to start.";

/** How old a webhook delivery may be, as msgbubbles recommends. */
const REPLAY_WINDOW_SECS = 300;

/**
 * Whether a webhook delivery really comes from msgbubbles: its X-msgbubbles-Signature header is
 * "t=<unix seconds>,v1=<hex>", an HMAC-SHA256 of "<t>.<raw body>" with our webhook secret.
 */
export function webhookSignatureIsValid(secret: string, rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((s) => s.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > REPLAY_WINDOW_SECS) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return expected.length === parts.v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

/** The hash a linking code is stored under. Codes are uppercase, without dashes. */
export const codeHash = (code: string) => sha256Hex(new TextEncoder().encode(code.toUpperCase()));

/** A linking code: 8 characters, without ones that look alike (0/O, 1/I/L), so ~10^12 possibilities. */
export function newCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => alphabet[b % alphabet.length]).join("");
}

/** Runs one text from `phone` and returns the reply. `origin` is the site's address, for links. */
export async function replyTo(phone: string, text: string, origin: string): Promise<string> {
  const command = parseCommand(text);
  if (command.kind === "help") return HELP_TEXT;
  if (command.kind === "link") return link(phone, command.code);
  // Anyone who gets alerts can stop them by text, linked or not, like on the remove page.
  if (command.kind === "stopAlerts") {
    await removeNumberFromAlerts(phone);
    return "Done: this number won't get CTOads alerts anymore.";
  }

  const { data: linked, error } = await supabase().from("text_numbers").select("account_id").eq("phone", phone).maybeSingle();
  if (error) throw error;
  if (!linked) return `This number isn't linked to a CTOads account yet. Get a code at ${origin}${TEXTS_PATH} and text it here.`;
  const account = linked.account_id as string;

  switch (command.kind) {
    case "unlink": {
      const { error: dbError } = await supabase().from("text_numbers").delete().eq("account_id", account);
      if (dbError) throw dbError;
      return `Unlinked. This number can't change ${account} anymore.`;
    }
    case "price": {
      const market = await getMarket();
      return `1 $CTO = ${formatNear(market.price_per_token)} NEAR. ${market.ctoads_minted}/${market.max_ctoads} CTOads minted.${
        market.takeover ? " The takeover is live." : ""
      }`;
    }
    case "buy":
      return `Tap to buy $CTO for ${command.near} NEAR. You'll confirm it in your wallet: ${origin}/?buy=${command.near}#trade`;
    case "sell":
      return `Tap to sell ${command.cto} $CTO. You'll confirm it in your wallet: ${origin}/?sell=${command.cto}#trade`;
    case "topUpHelp":
      return TOPUP_HELP_TEXT;
    case "topUp":
      return topUp(phone, account, command.assetId, command.amount, origin);
    case "topUpStatus":
      return topUpStatusReply(phone, origin);
    case "claim":
      return claimReply(account, origin);
    case "proposals":
      return proposalsReply(origin);
    case "vote":
      return voteReply(account, command.proposalId, command.approve, origin);
    case "profile": {
      const profile = await profileOf(account);
      return profile
        ? `Your page: ${origin}${profilePath(profile.handle)}`
        : `You don't have a page yet. Text SET HANDLE yourname to make one.`;
    }
    case "setHandle":
    case "setBio":
    case "setLink":
    case "removeLink":
      return editProfile(account, command, origin);
    default:
      return `Didn't get that.\n\n${HELP_TEXT}`;
  }
}

/** Links `phone` to the account whose code it texted, if the code is right and fresh. */
async function link(phone: string, code: string): Promise<string> {
  const db = supabase();
  const { data: row, error } = await db
    .from("text_numbers")
    .select("account_id, code_expires_at")
    .eq("code_hash", await codeHash(code))
    .maybeSingle();
  if (error) throw error;
  if (!row || new Date(row.code_expires_at) < new Date()) return "That code didn't work. Get a new one on the website.";
  // A number links to one account at a time, so it leaves any account it was linked to before.
  const { error: clearError } = await db.from("text_numbers").update({ phone: null }).eq("phone", phone);
  if (clearError) throw clearError;
  const { error: linkError } = await db
    .from("text_numbers")
    .update({ phone, code_hash: null, code_expires_at: null, linked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("account_id", row.account_id);
  if (linkError) throw linkError;
  await moveTextAlerts(row.account_id, phone);
  return `Linked to ${row.account_id}. Text HELP for what you can do.`;
}

/**
 * Text alerts go to the linked number, so they follow it. If the account gets alerts by text,
 * they move to its new number, and any other account stops getting alerts at that number.
 */
async function moveTextAlerts(account: string, phone: string): Promise<void> {
  const db = supabase();
  const { data: sub, error } = await db.from("alert_subscribers").select("phone").eq("account_id", account).maybeSingle();
  if (error) throw error;
  if (!sub?.phone || sub.phone === phone) return;
  await removeNumberFromAlerts(phone);
  const { error: saveError } = await db
    .from("alert_subscribers")
    .update({ phone, updated_at: new Date().toISOString() })
    .eq("account_id", account);
  if (saveError) throw saveError;
}

async function profileOf(account: string): Promise<Profile | null> {
  const { data, error } = await supabase().from("profiles").select("handle, bio, links").eq("account_id", account).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** Changes one thing on the account's profile, with the same checks as saving it on the website. */
async function editProfile(account: string, command: Command, origin: string): Promise<string> {
  if ((await nftTokensForOwner(account)).length === 0) return NOT_A_MEMBER;
  const current = await profileOf(account);
  if (!current && command.kind !== "setHandle") return "Pick a handle first: text SET HANDLE yourname.";
  const base: Profile = current ?? { handle: "", bio: "", links: [] };

  let next: Profile | string;
  if (command.kind === "setHandle") next = normalizeProfile({ ...base, handle: command.handle });
  else if (command.kind === "setBio") next = normalizeProfile({ ...base, bio: command.bio });
  else if (command.kind === "setLink") {
    const links = base.links.filter((l) => l.label !== command.label);
    next = normalizeProfile({ ...base, links: [...links, { label: command.label, url: command.url }] });
  } else if (command.kind === "removeLink") {
    next = normalizeProfile({ ...base, links: base.links.filter((l) => l.label !== command.label) });
  } else return HELP_TEXT;
  if (typeof next === "string") return next;

  const moderation = await moderate([`@${next.handle}`, next.bio, ...next.links.map((l) => l.label)].join("\n"));
  if (moderation.flagged) return `Not saved: it was flagged for ${moderation.categories.join(", ")}.`;
  const { error } = await supabase()
    .from("profiles")
    .upsert({ account_id: account, ...next, updated_at: new Date().toISOString() });
  if (error?.code === "23505") return `@${next.handle} is taken. Pick another one.`;
  if (error) throw error;
  return `Saved: ${origin}${profilePath(next.handle)}`;
}

/** How long after a TOPUP we keep checking on it, to text when the NEAR arrives. STATUS works after that too. */
export const TOPUP_WATCH_SECS = 270;
const TOPUP_POLL_SECS = 10;
const TOPUP_DONE: TopUpStatus[] = ["SUCCESS", "REFUNDED", "FAILED"];

/**
 * Starts a top-up from another chain: a real 1Click quote whose wNEAR goes to the linked account.
 * A refund goes to that account's balance on NEAR Intents, so no refund address is needed by text.
 * Replies with the deposit address, then keeps checking for a few minutes to text the outcome.
 */
async function topUp(phone: string, account: string, assetId: string, input: string, origin: string): Promise<string> {
  if (NETWORK !== "mainnet") return "Top-ups only work on the mainnet site.";
  const asset = TOPUP_ASSETS.find((a) => a.id === assetId)!;
  const amount = parseUnits(input, asset.decimals);
  if (!amount) return `Enter an amount, e.g. TOPUP 10 ${asset.symbol}.`;
  // wrap.near can't hold the wNEAR for an account that hasn't paid its one-time storage fee.
  if (!(await view<unknown>(WNEAR_CONTRACT, "storage_balance_of", { account_id: account }))) {
    return `${account} needs a one-time setup first (0.00125 NEAR) so it can receive NEAR. Tap "Get ready" here, then text TOPUP again: ${origin}/#topup`;
  }

  const label = `${input} ${asset.symbol} on ${asset.chain}`;
  let quote;
  try {
    quote = await requestQuote({ asset, amount: amount.toString(), recipient: account, refundTo: account, refundType: "INTENTS", dry: false });
  } catch (e) {
    if (!(e instanceof OneClickError)) throw e;
    if (e.status < 500) return `NEAR Intents said: ${e.message}`;
    console.error(e);
    return "NEAR Intents is busy right now. Try again in a minute.";
  }
  const depositAddress = quote.depositAddress!;
  const { error } = await supabase()
    .from("text_topups")
    .insert({ deposit_address: depositAddress, phone, account_id: account, label });
  if (error) throw error;
  // The address goes in a text of its own, right after this reply, so a long-press copies just
  // the address. The webhook sends the reply before the request ends; after() runs once it has.
  // If it doesn't go out, STATUS still shows the address.
  after(() =>
    sendText(phone, depositAddress, `topup-address-${depositAddress}`).catch((e) =>
      console.error("Couldn't text the top-up address", e),
    ),
  );
  after(() => watchTopUp(depositAddress, origin));

  return [
    `Send exactly ${label} to the address in the next text.`,
    `You'll get about ${formatNear(quote.amountOut, 2)} NEAR in ${account} (at least ${formatNear(quote.minAmountOut, 2)}), about ${quote.timeEstimate} s after it lands.`,
    `Only send ${asset.symbol} on ${asset.chain}, and only once. I'll text you when it arrives. Text STATUS anytime.`,
  ].join("\n\n");
}

/** Checks on a top-up every few seconds, for a few minutes, and texts the outcome once it has one. */
async function watchTopUp(depositAddress: string, origin: string): Promise<void> {
  const until = Date.now() + TOPUP_WATCH_SECS * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, TOPUP_POLL_SECS * 1000));
    try {
      const status = await topUpStatus(depositAddress);
      if (!TOPUP_DONE.includes(status)) continue;
      const row = await claimTopUp(depositAddress);
      if (row) await sendText(row.phone, outcomeText(status, row, origin), `topup-${depositAddress}`);
      return;
    } catch (e) {
      console.error(e);
    }
  }
}

type TopUpRow = { deposit_address: string; phone: string; account_id: string; label: string };

/** Marks a top-up's outcome as texted. Returns the row only the first time, so it's texted once. */
async function claimTopUp(depositAddress: string): Promise<TopUpRow | null> {
  const { data, error } = await supabase()
    .from("text_topups")
    .update({ done_at: new Date().toISOString() })
    .eq("deposit_address", depositAddress)
    .is("done_at", null)
    .select("deposit_address, phone, account_id, label")
    .maybeSingle();
  if (error) throw error;
  return data as TopUpRow | null;
}

function outcomeText(status: TopUpStatus, row: TopUpRow, origin: string): string {
  if (status === "SUCCESS") return `Your ${row.label} arrived as NEAR in ${row.account_id}. Tap to buy $CTO with it: ${origin}/#topup`;
  if (status === "REFUNDED") {
    return `The swap for your ${row.label} didn't go through. It was refunded to ${row.account_id} on NEAR Intents: near-intents.org`;
  }
  return `${STATUS_TEXT.FAILED} Deposit address: ${row.deposit_address}`;
}

/** The reply to STATUS: how this number's latest top-up is going. */
async function topUpStatusReply(phone: string, origin: string): Promise<string> {
  const { data, error } = await supabase()
    .from("text_topups")
    .select("deposit_address, phone, account_id, label")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "No top-up yet. Text e.g. TOPUP 10 USDC to start one.";
  const row = data as TopUpRow;
  const status = await topUpStatus(row.deposit_address);
  if (!TOPUP_DONE.includes(status)) return `${row.label}: ${STATUS_TEXT[status]}\nDeposit address: ${row.deposit_address}`;
  // Answering STATUS counts as texting the outcome, so the watcher doesn't text it again.
  await claimTopUp(row.deposit_address);
  return outcomeText(status, row, origin);
}

// Claiming and voting by text: like BUY and SELL, these only reply with a link. The claim or vote
// happens in the holder's own wallet, on the website.

/** How much the account's CTOads could claim, and a link to claim it. */
async function claimReply(account: string, origin: string): Promise<string> {
  const tokens = await nftTokensForOwner(account);
  if (tokens.length === 0) return `${account} doesn't hold a CTOad, so there's nothing to claim.`;
  const claimable = await Promise.all(tokens.map((t) => ctoadClaimable(t.token_id)));
  const total = claimable.reduce((sum, c) => sum + c.total, 0n);
  if (total === 0n) return `Your ${tokens.length} CTOad${tokens.length === 1 ? " has" : "s have"} nothing to claim yet.`;
  return `Your CTOads can claim ${formatNear(total)} NEAR. Tap to claim it in your wallet: ${origin}/claim`;
}

/** The open treasury votes, newest first. */
async function proposalsReply(origin: string): Promise<string> {
  const now = Date.now();
  const open = (await getProposals()).filter((p) => p.status === "Open" && p.voting_ends_ms > now).reverse();
  if (open.length === 0) return `No open votes right now. See all proposals: ${origin}/vote`;
  const lines = open.slice(0, 3).map(
    (p) => `#${p.id}: ${p.description} (${formatNear(p.amount)} NEAR, ${p.yes} yes / ${p.no} no)`,
  );
  return [...lines, "", "Reply VOTE 3 YES or VOTE 3 NO with the number."].join("\n");
}

/** A link to one proposal, if it's open and the account holds a CTOad to vote with. */
async function voteReply(account: string, proposalId: number, approve: boolean, origin: string): Promise<string> {
  const proposal = (await getProposals()).find((p) => p.id === proposalId);
  if (!proposal) return `There's no proposal #${proposalId}. Text PROPOSALS for the open ones.`;
  if (proposal.status !== "Open" || proposal.voting_ends_ms <= Date.now()) {
    return `Voting on #${proposalId} is closed (${proposal.status}).`;
  }
  if ((await nftTokensForOwner(account)).length === 0) return NOT_A_MEMBER;
  return `Tap to vote ${approve ? "YES" : "NO"} on #${proposalId} with your CTOads. You'll confirm it in your wallet: ${origin}/vote#proposal-${proposalId}`;
}
