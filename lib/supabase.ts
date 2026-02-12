import { createClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트 (Service Role Key)
 * 클라이언트에는 이 키를 노출하지 말 것.
 *
 * [바꿔야 하는 곳 - SUPABASE]
 * Vercel/로컬 .env.local에 설정:
 * - SUPABASE_URL: Supabase 프로젝트 URL (Dashboard → Settings → API)
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key
 */
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}
