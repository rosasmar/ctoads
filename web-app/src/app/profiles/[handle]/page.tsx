import { Suspense } from "react";

import { ProfilePage } from "@/components/ProfilePage";

// Reached at /@handle (see the rewrite in next.config.ts). With cacheComponents on, the handle is
// only known per request, so it's read inside Suspense.
export default function Profile({ params }: PageProps<"/profiles/[handle]">) {
  return <Suspense>{params.then(({ handle }) => <ProfilePage handle={handle} />)}</Suspense>;
}
