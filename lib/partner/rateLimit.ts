import { getSupabaseAdmin } from "@/lib/supabase";

export async function countPartnerRequestsLastMinute(keyId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from("partner_api_request_logs")
    .select("id", { count: "exact", head: true })
    .eq("key_id", keyId)
    .gte("created_at", since)
    .lt("status_code", 500);
  if (error) {
    console.warn("[partner-api] rate count:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function isPartnerRateLimited(
  keyId: string,
  limitPerMinute: number
): Promise<boolean> {
  const used = await countPartnerRequestsLastMinute(keyId);
  return used >= limitPerMinute;
}
