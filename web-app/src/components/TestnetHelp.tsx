"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";

const linkClass = "text-frog hover:underline";

/** How to get a testnet wallet and free testnet NEAR, for visitors who aren't connected yet. */
export function TestnetHelp() {
  const { signIn } = useWalletSelector();

  return (
    <aside className="space-y-3 p-5 text-sm md:p-6">
      <h2 className="font-semibold">New to NEAR testnet?</h2>
      <ol className="list-decimal space-y-2 pl-5 text-ink/80">
        <li>
          Get{" "}
          <a href="https://wallet.meteorwallet.app" target="_blank" rel="noreferrer" className={linkClass}>
            Meteor Wallet
          </a>
          . In Settings, tap the network button at the bottom until it says TEST, then create an account.
        </li>
        <li>
          Get free testnet NEAR from the{" "}
          <a href="https://docs.near.org/getting-started/faucet" target="_blank" rel="noreferrer" className={linkClass}>
            NEAR faucet
          </a>
          .
        </li>
        <li>
          Come back and{" "}
          <button onClick={() => signIn()} className={linkClass}>
            connect your wallet
          </button>
          .
        </li>
      </ol>
      <p className="text-xs text-ink/65">Testnet NEAR is free and has no value.</p>
    </aside>
  );
}
