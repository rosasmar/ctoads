// The picture X (and other apps) show when someone posts a CTOads link: a toad on the left, a
// headline on the right, in the site's cream and ink. Drawn on the server by `ImageResponse`.

import "server-only";
import { ImageResponse } from "next/og";

import { getArt, getLayer, randomLook, stackLayers } from "@/lib/cto";

/** The size X shows as a large card. */
export const SHARE_SIZE = { width: 1200, height: 630 };

const INK = "#17111f";
const CREAM = "#f6f0e4";
const PURPLE = "#503078";
const GREEN = "#00ec97";
const REKT = "#e5231b";

/**
 * Bricolage Grotesque, the site's headline font, as TTF from Google Fonts (the renderer can't read
 * woff2). Fetched once; if that fails, the card uses the renderer's default font.
 */
const headlineFont: Promise<ArrayBuffer | null> = (async () => {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600")).text();
    const url = css.match(/src: url\((.+?)\) format\('truetype'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
})();

/** The image renderer reads SVG reliably as base64, so a URL-encoded `data:` URI is re-encoded. */
function asBase64(dataUri: string): string {
  if (dataUri.startsWith("data:image/svg+xml;base64,")) return dataUri;
  const svg = decodeURIComponent(dataUri.slice(dataUri.indexOf(",") + 1));
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** A random look from the art in the contract, or null without art (or if the RPC fails). */
export async function randomToad(): Promise<string | null> {
  try {
    const art = await getArt();
    const layers = await Promise.all(randomLook(art).map(({ category, index }) => getLayer(category, index)));
    return layers.length ? stackLayers(layers) : null;
  } catch {
    return null;
  }
}

/** The card: `toad` (a `data:` URI) on the left, `title` and an optional red `line` on the right. */
export async function shareCard({ toad, title, line }: { toad: string | null; title: string[]; line?: string }) {
  const font = await headlineFont;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: CREAM, padding: 56, gap: 56 }}>
        {toad && (
          <div
            style={{
              display: "flex",
              width: 518,
              height: 518,
              borderRadius: 20,
              border: `3px solid ${PURPLE}`,
              overflow: "hidden",
              background: "white",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={asBase64(toad)} width={512} height={512} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, color: INK }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, opacity: 0.65 }}>
            [ $CTO · MEMBERSHIP COSTS A LOSS ]
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {title.map((t) => (
              <div
                key={t}
                style={{ display: "flex", fontFamily: "Bricolage", fontSize: 88, fontWeight: 600, lineHeight: 1.05, letterSpacing: -3 }}
              >
                {t}
              </div>
            ))}
            {line && <div style={{ display: "flex", marginTop: 24, fontSize: 40, color: REKT }}>{line}</div>}
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", background: GREEN, borderRadius: 10, padding: "8px 18px", fontFamily: "Bricolage", fontSize: 34, fontWeight: 600 }}>
              ctoads.xyz
            </div>
          </div>
        </div>
      </div>
    ),
    { ...SHARE_SIZE, fonts: font ? [{ name: "Bricolage", data: font, weight: 600, style: "normal" }] : undefined },
  );
}
