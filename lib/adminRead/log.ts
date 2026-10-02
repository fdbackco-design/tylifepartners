import { getSupabaseAdmin } from "@/lib/supabase";

export async function logAdminReadRequest(input: {
  keyId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs?: number;
  ip?: string | null;
  userAgent?: string | null;
  querySummary?: string;
  errorCode?: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("admin_read_api_request_logs").insert({
      key_id: input.keyId,
      method: input.method,
      path: input.path,
      status_code: input.statusCode,
      duration_ms: input.durationMs ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      query_summary: String(input.querySummary ?? "").slice(0, 500),
      error_code: input.errorCode ?? null,
    });
  } catch (e) {
    console.warn("[admin-read-api] request log failed:", e instanceof Error ? e.message : e);
  }
}
