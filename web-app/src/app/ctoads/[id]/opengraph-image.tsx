import { connection } from "next/server";

import { ctoadExtra, nftToken } from "@/lib/cto";
import { formatNear } from "@/lib/near";
import { randomToad, SHARE_SIZE, shareCard } from "@/lib/shareCard";

// The picture shown when someone posts a CTOad's page, e.g. from "Share on X" after minting: the
// toad as the contract draws it, and the loss that minted it.
export const alt = "A CTOad, minted by losing NEAR on $CTO";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  // Drawn per request, so a recolored toad shows its new look.
  await connection();
  const { id } = await params;
  const token = await nftToken(id).catch(() => null);
  if (!token) return shareCard({ toad: await randomToad(), title: [`CTOad #${id}`], line: "Not minted yet." });
  const loss = ctoadExtra(token).loss;
  return shareCard({
    toad: token.metadata?.media ?? null,
    title: [`CTOad #${id}`],
    line: loss ? `Lost ${formatNear(loss, 2)} NEAR to get it.` : undefined,
  });
}
