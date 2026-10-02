import {
  extractBearerToken,
  hashPartnerApiKey,
  isPartnerApiKeyFormat,
} from "@/lib/partner/crypto";
import type { PartnerApiPermissions, PartnerAuthContext } from "@/lib/partner/types";
import { getSupabaseAdmin } from "@/lib/supabase";

function mapPermissions(
  permRow: Record<string, unknown>,
  meta: { key_id: string; client_id: string; label: string; rate_limit_per_minute: number },
  clientName: string
): PartnerApiPermissions {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    key_id: meta.key_id,
    client_id: meta.client_id,
    client_name: clientName,
    label: meta.label,
    rate_limit_per_minute: meta.rate_limit_per_minute,
    allow_candidates: Boolean(permRow.allow_candidates),
    allow_tm001: Boolean(permRow.allow_tm001),
    allow_tm002: Boolean(permRow.allow_tm002),
    allow_calendar: Boolean(permRow.allow_calendar),
    candidate_utm_sources: arr(permRow.candidate_utm_sources),
    candidate_entry_pages: arr(permRow.candidate_entry_pages),
    candidate_regions: arr(permRow.candidate_regions),
    tm001_batch_codes: arr(permRow.tm001_batch_codes),
    tm002_batch_codes: arr(permRow.tm002_batch_codes),
    calendar_event_types: arr(permRow.calendar_event_types),
  };
}

export async function authenticatePartnerRequest(
  authHeader: string | null
): Promise<
  | { ok: true; ctx: PartnerAuthContext }
  | { ok: false; reason: "missing" | "invalid" | "revoked" | "expired" | "inactive" | "not_ready" }
> {
  const token = extractBearerToken(authHeader);
  if (!token) return { ok: false, reason: "missing" };
  if (!isPartnerApiKeyFormat(token)) return { ok: false, reason: "invalid" };

  const prefix = token.slice(0, 16);
  const hash = hashPartnerApiKey(token);
  const supabase = getSupabaseAdmin();

  const { data: keyRow, error } = await supabase
    .from("partner_api_keys")
    .select("id, client_id, label, key_hash, revoked_at, expires_at, rate_limit_per_minute")
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    if (/partner_api_|schema cache|does not exist/i.test(error.message)) {
      return { ok: false, reason: "not_ready" };
    }
    return { ok: false, reason: "invalid" };
  }
  if (!keyRow) return { ok: false, reason: "invalid" };
  if (String(keyRow.key_hash) !== hash) return { ok: false, reason: "invalid" };

  if (keyRow.expires_at && new Date(String(keyRow.expires_at)).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const { data: clientRow } = await supabase
    .from("partner_api_clients")
    .select("name, is_active")
    .eq("id", keyRow.client_id)
    .maybeSingle();

  if (!clientRow || clientRow.is_active === false) return { ok: false, reason: "inactive" };

  const { data: permRow, error: permErr } = await supabase
    .from("partner_api_key_permissions")
    .select("*")
    .eq("key_id", keyRow.id)
    .maybeSingle();

  if (permErr) {
    if (/partner_api_|schema cache|does not exist/i.test(permErr.message)) {
      return { ok: false, reason: "not_ready" };
    }
    return { ok: false, reason: "invalid" };
  }
  if (!permRow) return { ok: false, reason: "invalid" };

  const permissions = mapPermissions(
    permRow as Record<string, unknown>,
    {
      key_id: String(keyRow.id),
      client_id: String(keyRow.client_id),
      label: String(keyRow.label ?? ""),
      rate_limit_per_minute: Number(keyRow.rate_limit_per_minute ?? 60),
    },
    String(clientRow.name ?? "")
  );

  void supabase
    .from("partner_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  return {
    ok: true,
    ctx: {
      keyId: String(keyRow.id),
      clientId: String(keyRow.client_id),
      clientName: String(clientRow.name ?? ""),
      label: String(keyRow.label ?? ""),
      rateLimitPerMinute: Number(keyRow.rate_limit_per_minute ?? 60),
      permissions,
    },
  };
}
