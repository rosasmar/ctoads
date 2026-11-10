"use client";

import "@/lib/polyfills";
import "@near-wallet-selector/modal-ui/styles.css";

import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import { SWRConfig } from "swr";

import { NETWORK } from "@/config";

const walletSelectorConfig = {
  network: NETWORK,
  modules: [setupMeteorWallet(), setupIntearWallet(), setupHereWallet()],
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletSelectorProvider config={walletSelectorConfig}>
      <SWRConfig value={{ revalidateOnFocus: true, shouldRetryOnError: false }}>{children}</SWRConfig>
    </WalletSelectorProvider>
  );
}
