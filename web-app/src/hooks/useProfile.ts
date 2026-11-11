import useSWR from "swr";

import { type Profile, profileApi } from "@/lib/profile";

/** The profile of `accountId`, or null if it has none. Shared by every place that shows a holder. */
export function useProfileOf(accountId: string | null) {
  return useSWR(accountId ? ["profileOf", accountId] : null, ([, id]) =>
    profileApi<Profile>("GET", { query: `?account=${encodeURIComponent(id)}` }).catch(() => null),
  );
}
