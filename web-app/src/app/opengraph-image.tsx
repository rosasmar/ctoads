import { connection } from "next/server";

import { randomToad, SHARE_SIZE, shareCard } from "@/lib/shareCard";

// The picture shown when someone posts a link to the site (pages without their own).
export const alt = "CTOads: sell at a loss, get a toad";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default async function Image() {
  // Drawn per request: a fresh random toad each time, and no RPC call at build time.
  await connection();
  return shareCard({ toad: await randomToad(), title: ["Sell at a loss.", "Get a toad."] });
}
