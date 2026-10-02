import { getSupabaseAdmin } from "@/lib/supabase";

export async function isAdminReadRateLimited(keyId: string, limitPerMinute: number): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from("admin_read_api_request_logs")
    .select("id", { count: "exact", head: true })
    .eq("key_id", keyId)
    .gte("created_at", since)
    .lt("status_code", 500);
  if (error) return false;
  return (count ?? 0) >= limitPerMinute;
}
