"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { CONFIGURED, NETWORK } from "@/config";
import { useProfileOf } from "@/hooks/useProfile";
import { shortAccount } from "@/lib/near";
import { profilePath } from "@/lib/profile";

const LINKS = [
  { href: "/", label: "Trade" },
  { href: "/ctoads", label: "Gallery" },
  { href: "/claim", label: "Claim" },
  { href: "/vote", label: "Vote" },
  { href: "/texts", label: "Texts" },
  { href: "/alerts", label: "Alerts" },
  { href: "/profile", label: "Profile" },
];

/** The signed-in wallet as "@handle", linking to its profile, or its account name without one. */
function SignedInAs({ accountId }: { accountId: string }) {
  const { data: profile } = useProfileOf(accountId);
  if (!profile) return <span className="font-mono text-ink/80">{shortAccount(accountId)}</span>;
  return (
    // Not in the mono font: its "@" reads like an "a" ("@toad" looked like "atoad").
    <Link href={profilePath(profile.handle)} className="font-bold hover:underline underline-offset-4">
      @{profile.handle}
    </Link>
  );
}

export function Nav() {
  const { signedAccountId, signIn, signOut } = useWalletSelector();

  return (
    <header className="border-b-2 border-ink">
      {/* On phones the links get their own row under the logo and wallet button. */}
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
        <Link href="/" className="font-display text-2xl">
          CTOads
        </Link>
        <div className="order-last flex w-full flex-wrap gap-x-4 gap-y-1 text-sm sm:order-none sm:w-auto">
          {/* The current page is only known per request on pages like /ctoads/1, so the
              highlight streams in. Until then, no link is highlighted. */}
          <Suspense fallback={<NavLinks pathname={null} />}>
            <CurrentNavLinks />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {NETWORK === "testnet" && (
            <span className="border-2 border-dashed border-ink px-2 py-0.5 font-mono text-xs font-bold uppercase">testnet</span>
          )}
          {signedAccountId ? (
            <>
              <SignedInAs accountId={signedAccountId} />
              <button onClick={() => signOut()} className="text-ink/65 hover:text-ink">
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => signIn()} className="whitespace-nowrap rounded-lg press bg-accent px-3 py-1.5 font-bold text-ink">
              Connect wallet
            </button>
          )}
        </div>
      </nav>
      {!CONFIGURED && (
        <div className="bg-accent/40 px-4 py-2 text-center text-sm text-ink">
          Contracts aren&apos;t configured. Set <code>NEXT_PUBLIC_TOKEN_CONTRACT</code> and{" "}
          <code>NEXT_PUBLIC_NFT_CONTRACT</code> in <code>web-app/.env.local</code> (see DEPLOY.md).
        </div>
      )}
    </header>
  );
}

function CurrentNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

/** `/ctoads/1` highlights Gallery. */
function NavLinks({ pathname }: { pathname: string | null }) {
  return LINKS.map((l) => {
    const current = pathname === l.href || (l.href !== "/" && !!pathname?.startsWith(`${l.href}/`));
    return (
      <Link key={l.href} href={l.href} className={`font-bold ${current ? "underline decoration-2 underline-offset-4" : "text-ink/65 hover:text-ink"}`}>
        {l.label}
      </Link>
    );
  });
}
