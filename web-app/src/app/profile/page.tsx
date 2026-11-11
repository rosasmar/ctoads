import type { Metadata } from "next";

import { ProfileEditor } from "@/components/ProfileEditor";

export const metadata: Metadata = { title: "Your profile · CTOads" };

export default function EditProfile() {
  return <ProfileEditor />;
}
