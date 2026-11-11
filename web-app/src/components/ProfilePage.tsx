"use client";

import Link from "next/link";
import useSWR from "swr";

import { AccountLink } from "@/components/AccountLink";
import { CtoadImage } from "@/components/CtoadImage";
import { useOwnedCtoads } from "@/hooks/useCto";
import { type Profile, profileApi } from "@/lib/profile";

type StoredProfile = Profile & { accountId: string };

/** A holder's public page at /@handle: their CTOads, a short bio and their links, like a link-in-bio page. */
export function ProfilePage({ handle }: { handle: string }) {
  const { data: profile, error } = useSWR(["profile", handle], () =>
    profileApi<StoredProfile>("GET", { query: `?handle=${encodeURIComponent(handle)}` }),
  );
  const { data: ctoads } = useOwnedCtoads(profile?.accountId ?? null);

  if (error) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-3xl normal-case">No @{handle} here</h1>
        <p className="mt-2 text-ink/65">Nobody has claimed this handle yet.</p>
        <Link href="/profile" className="mt-6 inline-block font-bold underline underline-offset-4">
          Hold a CTOad? Make your own profile →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-8 py-4 text-center">
      <div className="space-y-3">
        <div className="mx-auto flex w-fit -space-x-6">
          {(ctoads?.length ? ctoads.slice(0, 3) : [undefined]).map((t, i) => (
            <CtoadImage
              key={t?.token_id ?? i}
              token={t}
              className="h-28 w-28 rounded-2xl border-4 border-ink bg-card shadow-hard odd:-rotate-3 even:rotate-3"
            />
          ))}
        </div>
        <h1 className="text-4xl normal-case">@{handle}</h1>
        {profile?.bio && <p className="text-lg text-ink/80">{profile.bio}</p>}
        {profile && (
          <p className="text-sm text-ink/65">
            {ctoads?.length ? `Holds ${ctoads.map((t) => `CTOad #${t.token_id}`).join(", ")}` : "A CTOads profile"} ·{" "}
            <AccountLink id={profile.accountId} keep={14} />
          </p>
        )}
      </div>

      <ul className="space-y-4">
        {profile?.links.map((l) => (
          <li key={l.url}>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer nofollow"
              className="press block rounded-xl bg-card px-5 py-4 text-lg font-bold"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>

      <p className="text-sm text-ink/65">
        <Link href="/" className="font-bold underline underline-offset-4">
          CTOads
        </Link>
        : sell $CTO at a loss, get a toad.
      </p>
    </div>
  );
}
