import type { Metadata } from "next";

import { TextsPage } from "@/components/TextsPage";

export const metadata: Metadata = { title: "Text your toad · CTOads" };

export default function Texts() {
  return <TextsPage />;
}
