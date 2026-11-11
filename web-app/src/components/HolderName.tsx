"use client";

import Link from "next/link";

import { AccountLink } from "@/components/AccountLink";
import { useProfileOf } from "@/hooks/useProfile";
import { profilePath } from "@/lib/profile";

/** A holder as "@handle", linking to their profile, or their account name if they haven't made one. */
export function HolderName({ accountId, keep, className }: { accountId: string; keep?: number; className?: string }) {
  const { data: profile } = useProfileOf(accountId);
  if (!profile) return <AccountLink id={accountId} keep={keep} />;
  return (
    <Link href={profilePath(profile.handle)} className={className ?? "font-bold underline underline-offset-4"}>
      @{profile.handle}
    </Link>
  );
}
