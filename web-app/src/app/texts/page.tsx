import type { Metadata } from "next";

import { TextsPage } from "@/components/TextsPage";

export const metadata: Metadata = { title: "Your phone · CTOads" };

export default function Texts() {
  return <TextsPage />;
}
