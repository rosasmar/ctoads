import useSWR from "swr";

import { alertsApi } from "@/lib/alerts";

/** Whether alerts can go by text, or only by email (no msgbubbles key on the server). True until known. */
export function useTextEnabled(): boolean {
  const { data } = useSWR("alerts-text-enabled", () => alertsApi<{ textEnabled: boolean }>("GET", ""));
  return data?.textEnabled ?? true;
}
