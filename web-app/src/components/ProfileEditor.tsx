"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { useState } from "react";

import { errorText } from "@/components/TradeFields";
import { useOwnedCtoads } from "@/hooks/useCto";
import { useProfileOf } from "@/hooks/useProfile";
import { signAlertsAction } from "@/lib/alerts";
import {
  DELETE_PROFILE_ACTION,
  MAX_BIO,
  MAX_LINKS,
  normalizeProfile,
  type Profile,
  type ProfileLink,
  profileAction,
  profileApi,
  profilePath,
} from "@/lib/profile";

const EMPTY_LINK: ProfileLink = { label: "", url: "" };

/** Make or change your profile at /@handle. Each save is signed by the wallet, like alerts. */
export function ProfileEditor() {
  const { signedAccountId, signIn } = useWalletSelector();
  // Kept here, so it survives the form starting over after a save or delete.
  const [message, setMessage] = useState<string | null>(null);
  const { data: tokens } = useOwnedCtoads(signedAccountId);
  // The same cache as every other place that shows this holder, so a save shows up in the top bar too.
  const { data: saved, mutate } = useProfileOf(signedAccountId);
  if (!signedAccountId) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-8 text-center">
        <h1 className="text-4xl">Your profile</h1>
        <p className="text-ink/80">
          CTOad holders get a page at ctoads.xyz/@yourname with their toads and links. Put it in your bio instead of a
          personal site.
        </p>
        <button onClick={() => signIn()} className="press rounded-xl bg-accent px-5 py-3 font-bold">
          Connect wallet
        </button>
      </div>
    );
  }

  const holder = (tokens?.length ?? 0) > 0;
  // `saved` is undefined while loading, then the profile or null. The form starts from it, and starts
  // over (by its key) when a profile is created or deleted.
  if (saved === undefined) return <p className="py-8 text-center text-ink/65">Loading…</p>;
  return (
    <ProfileForm
      key={saved ? "saved" : "new"}
      saved={saved}
      holder={holder}
      showNotHolder={!!tokens && !holder}
      message={message}
      setMessage={setMessage}
      onChange={() => mutate()}
    />
  );
}

function ProfileForm({
  saved,
  holder,
  showNotHolder,
  message,
  setMessage,
  onChange,
}: {
  saved: Profile | null;
  holder: boolean;
  showNotHolder: boolean;
  message: string | null;
  setMessage: (message: string | null) => void;
  onChange: () => Promise<unknown>;
}) {
  const { signMessage } = useWalletSelector();
  const [handle, setHandle] = useState(saved?.handle ?? "");
  const [bio, setBio] = useState(saved?.bio ?? "");
  const [links, setLinks] = useState<ProfileLink[]>(
    saved?.links.length ? saved.links : [{ label: "X", url: "" }, { label: "GitHub", url: "" }],
  );
  const [busy, setBusy] = useState(false);
  const draft = normalizeProfile({ handle, bio, links });

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage(done);
      await onChange();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (typeof draft === "string") return setMessage(draft);
    return run(async () => {
      const proof = await signAlertsAction(signMessage, profileAction(draft));
      await profileApi("POST", { body: { proof, profile: draft } });
    }, `Saved. Your page is live at ctoads.xyz${profilePath(draft.handle)}.`);
  };

  const remove = () =>
    run(async () => {
      const proof = await signAlertsAction(signMessage, DELETE_PROFILE_ACTION);
      await profileApi("DELETE", { body: { proof } });
    }, "Profile deleted.");

  const setLink = (i: number, change: Partial<ProfileLink>) =>
    setLinks(links.map((l, j) => (j === i ? { ...l, ...change } : l)));

  const inputClass = "mt-1 w-full rounded-xl border-2 border-ink bg-white px-3 py-2 outline-none";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-4xl">Your profile</h1>
        <p className="mt-2 text-ink/80">
          A page at ctoads.xyz/@yourname with your toads and links. Everything here is public.
        </p>
      </div>

      {showNotHolder ? (
        <p className="rounded-xl bg-ink/5 p-4 text-sm text-ink/80">
          Profiles are for CTOad holders, and this wallet holds none. <Link href="/" className="font-bold underline">Lose some $CTO</Link> to get one.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4 rounded-2xl border-2 border-ink bg-card p-5 shadow-hard"
        >
          <label className="block">
            <span className="font-mono text-xs font-bold">HANDLE</span>
            <span className="mt-1 flex items-center rounded-xl border-2 border-ink bg-white px-3">
              <span className="text-ink/65">ctoads.xyz/@</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, "").toLowerCase())}
                placeholder="yourname"
                autoComplete="off"
                className="w-full min-w-0 bg-transparent py-2 outline-none"
              />
            </span>
          </label>
          <label className="block">
            <span className="font-mono text-xs font-bold">BIO</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={MAX_BIO}
              rows={2}
              placeholder="Bagholder since day one."
              className={`${inputClass} resize-y`}
            />
            <span className="text-xs text-ink/65">
              {bio.length}/{MAX_BIO}
            </span>
          </label>

          <fieldset className="space-y-2">
            <legend className="font-mono text-xs font-bold">LINKS</legend>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label={`Link ${i + 1} name`}
                  value={l.label}
                  onChange={(e) => setLink(i, { label: e.target.value })}
                  placeholder="Name"
                  className="w-28 shrink-0 rounded-xl border-2 border-ink bg-white px-3 py-2 outline-none"
                />
                <input
                  aria-label={`Link ${i + 1} address`}
                  value={l.url}
                  onChange={(e) => setLink(i, { url: e.target.value })}
                  placeholder="x.com/you"
                  inputMode="url"
                  className="w-full min-w-0 rounded-xl border-2 border-ink bg-white px-3 py-2 outline-none"
                />
                <button
                  type="button"
                  aria-label={`Remove link ${i + 1}`}
                  onClick={() => setLinks(links.length > 1 ? links.filter((_, j) => j !== i) : [EMPTY_LINK])}
                  className="px-2 text-ink/65 hover:text-ink"
                >
                  ✕
                </button>
              </div>
            ))}
            {links.length < MAX_LINKS && (
              <button type="button" onClick={() => setLinks([...links, EMPTY_LINK])} className="text-sm font-bold underline">
                + Add a link
              </button>
            )}
          </fieldset>

          <button type="submit" disabled={busy || !holder} className="press w-full rounded-xl bg-accent py-3 font-bold disabled:opacity-40">
            {busy ? "Confirm in your wallet…" : saved ? "Save changes" : "Create my page"}
          </button>
          <p className="text-xs text-ink/65">
            Your wallet signs a short message to prove it&apos;s yours. It costs nothing. The bio and link names are checked
            by private AI first.
          </p>
        </form>
      )}

      {message && <p className="text-sm text-ink/80">{message}</p>}

      {saved && (
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <Link href={profilePath(saved.handle)} className="font-bold underline underline-offset-4">
            View ctoads.xyz{profilePath(saved.handle)} →
          </Link>
          <Link href="/texts" className="font-bold underline underline-offset-4">
            Edit it by text →
          </Link>
          <button onClick={remove} disabled={busy} className="text-ink/65 hover:text-ink disabled:opacity-40">
            Delete my profile
          </button>
        </div>
      )}
    </div>
  );
}
