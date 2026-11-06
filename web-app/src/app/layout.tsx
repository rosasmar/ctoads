import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "$CTO · CTOads",
  description: "Sell $CTO at a loss and mint a CTOad. When the last one mints, the bagholders take over the fees.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-white/40">
            Built at NEAR HACKATHON. Not financial advice: the whole point is losing money.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
