import { Suspense } from "react";

import { CtoadPage } from "@/components/CtoadPage";

// With cacheComponents on, the id is only known per request, so it's read inside Suspense.
export default function Ctoad({ params }: PageProps<"/ctoads/[id]">) {
  return <Suspense>{params.then(({ id }) => <CtoadPage id={id} />)}</Suspense>;
}
