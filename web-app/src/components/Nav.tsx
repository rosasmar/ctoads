"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { CONFIGURED, NETWORK } from "@/config";
import { shortAccount } from "@/lib/near";

const LINKS = [
  { href: "/", label: "Trade" },
  { href: "/ctoads", label: "CTOads" },
  { href: "/claim", label: "Claim" },
  { href: "/vote", label: "Vote" },
  { href: "/alerts", label: "Alerts" },
];

export function Nav() {
  const { signedAccountId, signIn, signOut } = useWalletSelector();

  return (
    <header className="border-b border-white/10">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="text-frog">$CTO</span>
        </Link>
        <div className="flex gap-4 text-sm">
          {/* The current page is only known per request on pages like /ctoads/1, so the
              highlight streams in. Until then, no link is highlighted. */}
          <Suspense fallback={<NavLinks pathname={null} />}>
            <CurrentNavLinks />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {NETWORK === "testnet" && (
            <span className="rounded bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">testnet</span>
          )}
          {signedAccountId ? (
            <>
              <span className="font-mono text-white/70">{shortAccount(signedAccountId)}</span>
              <button onClick={() => signOut()} className="text-white/50 hover:text-white">
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => signIn()} className="rounded-lg bg-frog px-3 py-1.5 font-medium text-black hover:brightness-110">
              Connect wallet
            </button>
          )}
        </div>
      </nav>
      {!CONFIGURED && (
        <div className="bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-200">
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

/** `/ctoads/1` highlights CTOads. */
function NavLinks({ pathname }: { pathname: string | null }) {
  return LINKS.map((l) => {
    const current = pathname === l.href || (l.href !== "/" && !!pathname?.startsWith(`${l.href}/`));
    return (
      <Link key={l.href} href={l.href} className={current ? "text-white" : "text-white/50 hover:text-white/80"}>
        {l.label}
      </Link>
    );
  });
}
