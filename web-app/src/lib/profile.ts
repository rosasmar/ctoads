// Holders' public profiles at /@handle, shared by the browser (which builds and signs them) and the
// server (which checks them the same way). Signing reuses the alerts proof in lib/alerts.ts.

/** A profile as it's stored and shown. */
export type Profile = { handle: string; bio: string; links: ProfileLink[] };
export type ProfileLink = { label: string; url: string };

export const MAX_BIO = 160;
export const MAX_LINKS = 6;
const MAX_LABEL = 24;
const MAX_URL = 200;

/** Handles that would clash with the app's own pages. */
const RESERVED = new Set(["alerts", "api", "claim", "ctoad", "ctoads", "cto", "profile", "profiles", "privacy", "terms", "vote", "admin"]);

/** The page a profile lives at, e.g. "/@rosasmar". */
export const profilePath = (handle: string) => `/@${handle}`;

/** A link's address with https:// added if it was left out, or null if it isn't a web address. */
function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > MAX_URL) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Cleans up a profile someone typed: a lowercase handle without "@", trimmed text, links with
 * https://, empty link rows dropped. Returns the profile, or a message saying what's wrong.
 */
export function normalizeProfile(input: { handle?: unknown; bio?: unknown; links?: unknown }): Profile | string {
  const handle = typeof input.handle === "string" ? input.handle.trim().replace(/^@/, "").toLowerCase() : "";
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return "Pick a handle of 3 to 20 letters, numbers or underscores.";
  if (RESERVED.has(handle)) return `@${handle} is taken by the app. Pick another one.`;
  const bio = typeof input.bio === "string" ? input.bio.trim().replace(/\s+/g, " ") : "";
  if (bio.length > MAX_BIO) return `Keep the bio under ${MAX_BIO} characters.`;
  const rows = Array.isArray(input.links) ? input.links : [];
  const links: ProfileLink[] = [];
  for (const row of rows) {
    const label = typeof row?.label === "string" ? row.label.trim() : "";
    const rawUrl = typeof row?.url === "string" ? row.url : "";
    // A row without an address is left out, so the suggested "X" and "GitHub" rows can stay empty.
    if (!rawUrl.trim()) continue;
    if (!label || label.length > MAX_LABEL) return `Give each link a name of up to ${MAX_LABEL} characters.`;
    const url = normalizeUrl(rawUrl);
    if (!url) return `"${label}" needs a web address, like github.com/you.`;
    links.push({ label, url });
  }
  if (links.length > MAX_LINKS) return `Add at most ${MAX_LINKS} links.`;
  return { handle, bio, links };
}

/** What the wallet signs to save a profile. It names every field, so a signature can't be reused for another. */
export const profileAction = (p: Profile) =>
  [`Save my CTOads profile @${p.handle}`, `Bio: ${p.bio}`, ...p.links.map((l) => `${l.label}: ${l.url}`)].join("\n");

export const DELETE_PROFILE_ACTION = "Delete my CTOads profile";

/** Calls /api/profile from the browser and returns its JSON, or throws its error message. */
export async function profileApi<T>(method: string, init?: { query?: string; body?: object }): Promise<T> {
  const res = await fetch(`/api/profile${init?.query ?? ""}`, {
    method,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}
