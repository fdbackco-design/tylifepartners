import { generateAdminReadApiKey } from "@/lib/adminRead/crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export type CreateAdminReadKeyInput = {
  label?: string;
  expires_at: string;
  rate_limit_per_minute?: number;
  allow_candidates?: boolean;
  allow_tm001?: boolean;
  allow_tm002?: boolean;
  allow_calendar?: boolean;
};

export async function createAdminReadApiKeyRecord(
  input: CreateAdminReadKeyInput,
  createdBy: string | null
): Promise<{ keyId: string; plaintext: string; prefix: string }> {
  const expiresAt = new Date(input.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new Error("expires_at는 미래 시각(ISO)이어야 합니다.");
  }

  const { plaintext, prefix, hash } = generateAdminReadApiKey();
  const supabase = getSupabaseAdmin();

  const { data: keyRow, error: keyErr } = await supabase
    .from("admin_read_api_keys")
    .insert({
      label: String(input.label ?? "").slice(0, 120),
      key_prefix: prefix,
      key_hash: hash,
      expires_at: expiresAt.toISOString(),
      rate_limit_per_minute: Math.min(Math.max(Number(input.rate_limit_per_minute ?? 120), 1), 600),
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (keyErr || !keyRow) throw new Error(keyErr?.message ?? "키 생성 실패");

  const { error: permErr } = await supabase.from("admin_read_api_key_permissions").insert({
    key_id: keyRow.id,
    allow_candidates: input.allow_candidates !== false,
    allow_tm001: input.allow_tm001 !== false,
    allow_tm002: input.allow_tm002 !== false,
    allow_calendar: input.allow_calendar !== false,
  });

  if (permErr) throw new Error(permErr.message);

  return { keyId: String(keyRow.id), plaintext, prefix };
}

export async function revokeAdminReadApiKey(keyId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_read_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}
