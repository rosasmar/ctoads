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
          {/* A row of cells, like the rest of the grid: the time, the event, the contract, the fine print and the code. */}
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
                </Link>{" "}
                ·{" "}
                <a
                  href="https://github.com/rosasmar/ctoads"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-frog hover:underline"
                >
                  {/* GitHub's mark (Octicons, MIT). */}
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 fill-current">
                    <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
                  </svg>
                  GitHub ↗
                </a>
              </span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
