import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter_Tight, JetBrains_Mono } from "next/font/google";
import Link from "next/link";

import { Clock } from "@/components/Clock";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import { EXPLORER_URL, NFT_CONTRACT } from "@/config";
import { textingEnabled } from "@/lib/msgbubbles";

import "./globals.css";

const sans = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});
const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CTOads · $CTO",
  description: "Sell $CTO at a loss and mint a CTOad. When the last one mints, the bagholders take over the fees.",
  // Posts on X show the share image (opengraph-image.tsx) large, not as a thumbnail.
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          {/* A row of cells, like the rest of the grid: the time, the event, the contract, the code and fine print. */}
          <footer className="mx-auto mb-6 grid w-full max-w-6xl px-4 font-mono text-xs">
            <div className="grid overflow-hidden rounded-xl border border-ink bg-card sm:grid-cols-4 [&>*]:border-line [&>*]:px-4 [&>*]:py-3 [&>*:not(:last-child)]:border-b sm:[&>*:not(:last-child)]:border-r sm:[&>*:not(:last-child)]:border-b-0">
              <Clock />
              <span>Built at NEAR HACKATHON. Not financial advice.</span>
              {NFT_CONTRACT ? (
                <a
                  href={`${EXPLORER_URL}/address/${NFT_CONTRACT}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {NFT_CONTRACT} ↗
                </a>
              ) : (
                <span />
              )}
              <span>
                <a
                  href="https://github.com/rosasmar/ctoads"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  GitHub ↗
                </a>{" "}
                ·{" "}
                {textingEnabled() && (
                  <>
                    Texts by{" "}
                    <a href="https://msgbubbles.com" target="_blank" rel="noreferrer" className="hover:underline">
                      msgbubbles
                    </a>{" "}
                    ·{" "}
                  </>
                )}
                <Link href="/privacy" className="hover:underline">
                  Privacy
                </Link>{" "}
                ·{" "}
                <Link href="/terms" className="hover:underline">
                  Terms
                </Link>
              </span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
