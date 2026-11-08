"use client";

import type { NftToken } from "@/lib/cto";

/**
 * A CTOad's image, exactly as the NFT contract draws it: its layers stacked into one SVG, sent in
 * `media` as a `data:` URI. While the token is loading, a blank tile of the same size.
 */
export function CtoadImage({ token, className }: { token?: NftToken; className?: string }) {
  const media = token?.metadata?.media;
  if (!media) return <div className={`animate-pulse bg-white/5 ${className ?? ""}`} />;
  // A data: URI has nothing for next/image to optimize, so a plain <img> is enough.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={media} alt={`CTOad #${token.token_id}`} className={className} />;
}

/** A CTOad that isn't minted yet. Its traits are only picked at mint, so nobody can know its look. */
export function UnmintedCtoad({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-white/5 font-bold text-white/30 ${className ?? ""}`}>?</div>
  );
}
