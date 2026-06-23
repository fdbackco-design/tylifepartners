import { getSupabaseAdmin } from "@/lib/supabase";

export type HqManagerSyncEventRow = {
  event_id: string;
  spreadsheet_id: string;
  sheet_name: string;
  row_number: number;
  new_manager_name: string;
  customer_name: string;
  phone: string;
  sheet_update_status: string;
  sync_status: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
};

export async function getHqManagerSyncEvent(
  eventId: string
): Promise<HqManagerSyncEventRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("hq_manager_sync_events")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[hqManagerSync] get event error:", error.message);
    return null;
  }
  return data as HqManagerSyncEventRow | null;
}

export async function upsertHqManagerSyncEvent(input: {
  eventId: string;
  spreadsheetId: string;
  sheetName: string;
  rowNumber: number;
  newManagerName: string;
  customerName: string;
  phone: string;
  sheetUpdateStatus?: string;
  syncStatus?: string;
  attemptCount?: number;
  lastError?: string | null;
  syncedAt?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from("hq_manager_sync_events").upsert(
    {
      event_id: input.eventId,
      spreadsheet_id: input.spreadsheetId,
      sheet_name: input.sheetName,
      row_number: input.rowNumber,
      new_manager_name: input.newManagerName,
      customer_name: input.customerName,
      phone: input.phone,
      sheet_update_status: input.sheetUpdateStatus ?? "pending",
      sync_status: input.syncStatus ?? "pending",
      attempt_count: input.attemptCount ?? 0,
      last_error: input.lastError ?? null,
      updated_at: now,
      synced_at: input.syncedAt ?? null,
    },
    { onConflict: "event_id" }
  );

  if (error) {
    console.error("[hqManagerSync] upsert event error:", error.message);
    throw new Error(error.message);
  }
}
