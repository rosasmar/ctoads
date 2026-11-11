// Text commands: holders text the app's number to change their profile or get a trade link.
// Shared by the browser (the /texts page) and the server (the msgbubbles webhook).

/** The page where a holder links their number. */
export const TEXTS_PATH = "/texts";

/** What the wallet signs to get a linking code, or to unlink. */
export const LINK_TEXTS_ACTION = "Link my phone to CTOads text commands";
export const UNLINK_TEXTS_ACTION = "Unlink my phone from CTOads text commands";

/** How long a linking code works. */
export const CODE_MINUTES = 15;

/** What /api/texts says about an account. Never the number itself. */
export type TextsStatus = { linked: boolean; pending: boolean };

/** Profile links that can be set by name, and the page they point to. */
const LINK_KINDS = {
  x: { label: "X", base: "x.com/" },
  twitter: { label: "X", base: "x.com/" },
  github: { label: "GitHub", base: "github.com/" },
  telegram: { label: "Telegram", base: "t.me/" },
  website: { label: "Website", base: "" },
  site: { label: "Website", base: "" },
} as const;

export type Command =
  | { kind: "help" }
  | { kind: "link"; code: string }
  | { kind: "unlink" }
  | { kind: "stopAlerts" }
  | { kind: "profile" }
  | { kind: "price" }
  | { kind: "buy"; near: string }
  | { kind: "sell"; cto: string }
  | { kind: "setHandle"; handle: string }
  | { kind: "setBio"; bio: string }
  | { kind: "setLink"; label: string; url: string }
  | { kind: "removeLink"; label: string }
  | { kind: "unknown" };

/** Reads one text as a command. Case and extra spaces don't matter. */
export function parseCommand(input: string): Command {
  const text = input.trim().replace(/\s+/g, " ");
  let m: RegExpMatchArray | null;
  if (/^(help|commands|\?)$/i.test(text)) return { kind: "help" };
  if ((m = text.match(/^link ([a-z0-9-]{8,12})$/i))) return { kind: "link", code: m[1].replace(/-/g, "").toUpperCase() };
  if (/^unlink$/i.test(text)) return { kind: "unlink" };
  if (/^(stop|unsubscribe|cancel|end|quit)$/i.test(text)) return { kind: "stopAlerts" };
  if (/^(profile|me)$/i.test(text)) return { kind: "profile" };
  if (/^price$/i.test(text)) return { kind: "price" };
  if ((m = text.match(/^buy (\d+(?:\.\d+)?)(?: ?near)?$/i))) return { kind: "buy", near: m[1] };
  if ((m = text.match(/^sell (\d+(?:\.\d+)?)(?: ?\$?cto)?$/i))) return { kind: "sell", cto: m[1] };
  if ((m = text.match(/^set handle @?(\S+)$/i))) return { kind: "setHandle", handle: m[1] };
  if ((m = text.match(/^set bio (.+)$/i))) return { kind: "setBio", bio: m[1] };
  if ((m = text.match(/^set (x|twitter|github|telegram|website|site) (\S+)$/i))) {
    const kind = LINK_KINDS[m[1].toLowerCase() as keyof typeof LINK_KINDS];
    const value = m[2];
    // "@name" or "name" becomes the page on that site; anything with a dot or slash is used as given.
    const url = kind.base && !/[./]/.test(value) ? `${kind.base}${value.replace(/^@/, "")}` : value;
    return { kind: "setLink", label: kind.label, url };
  }
  if ((m = text.match(/^remove (x|twitter|github|telegram|website|site)$/i))) {
    return { kind: "removeLink", label: LINK_KINDS[m[1].toLowerCase() as keyof typeof LINK_KINDS].label };
  }
  return { kind: "unknown" };
}

/** The reply to HELP, and to anything that isn't a command. */
export const HELP_TEXT = [
  "CTOads commands:",
  "SET HANDLE yourname",
  "SET BIO your bio",
  "SET X yourname (also GITHUB, TELEGRAM, WEBSITE)",
  "REMOVE X",
  "PROFILE: your page",
  "BUY 1: a link to buy $CTO for 1 NEAR",
  "SELL 1000: a link to sell 1000 $CTO",
  "PRICE",
  "UNLINK: stop commands from this number",
  "STOP: stop alerts to this number",
].join("\n");
