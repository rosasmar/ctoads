// What happens when someone texts the app's number (lib/texts.ts has the commands). Only a number
// linked to an account (by texting the code from /texts) can change anything, and changes to a
// profile still need that account to hold a CTOad. Trades are never made here: BUY and SELL only
// reply with a link that opens the trade in the holder's own wallet.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "@/lib/alerts";
import { getMarket, nftTokensForOwner } from "@/lib/cto";
import { moderate } from "@/lib/moderation";
import { formatNear } from "@/lib/near";
import { normalizeProfile, type Profile, profilePath } from "@/lib/profile";
import { removeNumberFromAlerts } from "@/lib/removeNumber";
import { supabase } from "@/lib/supabase";
import { type Command, HELP_TEXT, parseCommand, TEXTS_PATH } from "@/lib/texts";

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
  return `Linked to ${row.account_id}. Text HELP for what you can do.`;
}

async function profileOf(account: string): Promise<Profile | null> {
  const { data, error } = await supabase().from("profiles").select("handle, bio, links").eq("account_id", account).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** Changes one thing on the account's profile, with the same checks as saving it on the website. */
async function editProfile(account: string, command: Command, origin: string): Promise<string> {
  if ((await nftTokensForOwner(account)).length === 0) return `${account} doesn't hold a CTOad, so it can't change a profile.`;
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
