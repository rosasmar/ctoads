"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import { CONFIGURED } from "@/config";
import { ctoadExtra, getArt, getLayer, randomLook as pickLook, stackLayers, type ArtView, type Layer, type NftToken } from "@/lib/cto";

/**
 * A CTOad's image, exactly as the NFT contract draws it: its layers stacked into one SVG, sent in
 * `media` as a `data:` URI. While the token is loading, a blank tile of the same size.
 */
export function CtoadImage({ token, className }: { token?: NftToken; className?: string }) {
  const media = token?.metadata?.media;
  if (!media) return <div className={`animate-pulse bg-ink/5 ${className ?? ""}`} />;
  // A data: URI has nothing for next/image to optimize, so a plain <img> is enough.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={media} alt={`CTOad #${token.token_id}`} className={className} />;
}

/** A CTOad that isn't minted yet. Its traits are only picked at mint, so nobody can know its look. */
export function UnmintedCtoad({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-ink/5 font-bold text-ink/65 ${className ?? ""}`}>?</div>
  );
}

/** How long each look of `ToadPreview` stays up. */
const PREVIEW_MS = 2_500;

// Layers never change once uploaded (only replace_layer could, before freeze_art), so each one is
// fetched once per page load.
const layerCache = new Map<string, Promise<Layer>>();
function cachedLayer(category: string, index: number) {
  const key = `${category}/${index}`;
  let layer = layerCache.get(key);
  if (!layer) {
    layer = getLayer(category, index);
    layer.catch(() => layerCache.delete(key));
    layerCache.set(key, layer);
  }
  return layer;
}

/** A random look from the art, stacked into one image. */
async function randomLook(art: ArtView): Promise<string> {
  return stackLayers(await Promise.all(pickLook(art).map(({ category, index }) => cachedLayer(category, index))));
}

/**
 * Before the first mint: a new random CTOad look every few seconds, from the layers stored in the
 * contract. Without any art, the plain "?" tile.
 */
export function ToadPreview({ className }: { className?: string }) {
  const { data: art, error } = useSWR(CONFIGURED ? "art" : null, getArt, { revalidateOnFocus: false });
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!art) return;
    let live = true;
    // The old look stays up until every layer of the next one has loaded, so it never flickers.
    const next = () =>
      randomLook(art).then(
        (look) => live && setSrc(look),
        () => live && setFailed(true),
      );
    next();
    const timer = setInterval(next, PREVIEW_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [art]);

  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="A random CTOad look" className={className} />;
  const hasArt = art?.categories.some((c) => c.layers.length > 0);
  if (error || failed || (art && !hasArt)) return <UnmintedCtoad className={className} />;
  return <div className={`animate-pulse bg-ink/5 ${className ?? ""}`} />;
}

/** A CTOad's traits as the contract lists them, background first. */
export function CtoadTraits({ token, className }: { token: NftToken; className?: string }) {
  const traits = ctoadExtra(token).traits ?? [];
  if (!traits.length) return null;
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-2 ${className ?? ""}`}>
      {traits.map((t) => (
        <div key={t.category} className="contents">
          <dt className="text-ink/65">{t.category}</dt>
          <dd className="truncate">{t.name}</dd>
        </div>
      ))}
    </dl>
  );
}
