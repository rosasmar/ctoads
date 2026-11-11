// Taking a phone number out of alerts, shared by the remove page and a STOP text.

import "server-only";
import { supabase } from "@/lib/supabase";

/** Stops alerts to `phone`. A sign-up with a verified email keeps it and switches to email; otherwise it's deleted. */
export async function removeNumberFromAlerts(phone: string): Promise<void> {
  const db = supabase();
  const { data: row, error } = await db.from("alert_subscribers").select("account_id, email").eq("phone", phone).maybeSingle();
  if (error) throw error;
  if (!row) return;
  const { error: saveError } = row.email
    ? await db.from("alert_subscribers").update({ phone: null, channels: "email" }).eq("account_id", row.account_id)
    : await db.from("alert_subscribers").delete().eq("account_id", row.account_id);
  if (saveError) throw saveError;
}
