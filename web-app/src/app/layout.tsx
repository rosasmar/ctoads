import type { Metadata } from "next";
import { Bowlby_One, Space_Grotesk, Space_Mono } from "next/font/google";
import Link from "next/link";

import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import { textingEnabled } from "@/lib/msgbubbles";

import "./globals.css";

const display = Bowlby_One({ variable: "--font-bowlby-one", weight: "400", subsets: ["latin"] });
const sans = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const mono = Space_Mono({ variable: "--font-space-mono", weight: ["400", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "$CTO · CTOads",
  description: "Sell $CTO at a loss and mint a CTOad. When the last one mints, the bagholders take over the fees.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t-2 border-ink px-4 py-6 text-center text-xs text-ink/65">
            Built at NEAR HACKATHON. Not financial advice: the whole point is losing money.{" "}
            {textingEnabled() && (
              <>
                Alert texts powered by{" "}
                <a href="https://msgbubbles.com" target="_blank" rel="noreferrer" className="hover:text-ink">
                  msgbubbles
                </a>{" "}
                ·{" "}
              </>
            )}
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>{" "}
            ·{" "}
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
