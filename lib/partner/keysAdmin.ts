import { generatePartnerApiKey } from "@/lib/partner/crypto";
import { PARTNER_CALENDAR_TYPES_DEFAULT } from "@/lib/partner/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export type CreatePartnerKeyInput = {
  client_id: string;
  label?: string;
  rate_limit_per_minute?: number;
  expires_at?: string | null;
  allow_candidates?: boolean;
  allow_tm001?: boolean;
  allow_tm002?: boolean;
  allow_calendar?: boolean;
  candidate_utm_sources?: string[];
  candidate_entry_pages?: string[];
  candidate_regions?: string[];
  tm001_batch_codes?: string[];
  tm002_batch_codes?: string[];
  calendar_event_types?: string[];
};

function cleanArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

export async function createPartnerApiKeyRecord(
  input: CreatePartnerKeyInput,
  createdBy: string | null
): Promise<{ keyId: string; plaintext: string; prefix: string }> {
  const { plaintext, prefix, hash } = generatePartnerApiKey();
  const supabase = getSupabaseAdmin();

  const { data: keyRow, error: keyErr } = await supabase
    .from("partner_api_keys")
    .insert({
      client_id: input.client_id,
      label: String(input.label ?? "").slice(0, 120),
      key_prefix: prefix,
      key_hash: hash,
      rate_limit_per_minute: Math.min(Math.max(Number(input.rate_limit_per_minute ?? 60), 1), 600),
      expires_at: input.expires_at || null,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (keyErr || !keyRow) throw new Error(keyErr?.message ?? "키 생성 실패");

  const { error: permErr } = await supabase.from("partner_api_key_permissions").insert({
    key_id: keyRow.id,
    allow_candidates: Boolean(input.allow_candidates),
    allow_tm001: Boolean(input.allow_tm001),
    allow_tm002: Boolean(input.allow_tm002),
    allow_calendar: Boolean(input.allow_calendar),
    candidate_utm_sources: cleanArr(input.candidate_utm_sources),
    candidate_entry_pages: cleanArr(input.candidate_entry_pages),
    candidate_regions: cleanArr(input.candidate_regions),
    tm001_batch_codes: cleanArr(input.tm001_batch_codes),
    tm002_batch_codes: cleanArr(input.tm002_batch_codes),
    calendar_event_types: cleanArr(input.calendar_event_types).length
      ? cleanArr(input.calendar_event_types)
      : [...PARTNER_CALENDAR_TYPES_DEFAULT],
  });

  if (permErr) throw new Error(permErr.message);

  return { keyId: String(keyRow.id), plaintext, prefix };
}

export async function revokePartnerApiKey(keyId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("partner_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}
