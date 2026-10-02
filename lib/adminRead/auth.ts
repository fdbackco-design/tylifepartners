import {
  extractBearerToken,
  hashAdminReadApiKey,
  isAdminReadApiKeyFormat,
  isPartnerApiKeyFormat,
} from "@/lib/adminRead/crypto";
import type { AdminReadAuthContext, AdminReadPermissions } from "@/lib/adminRead/types";
import { getSupabaseAdmin } from "@/lib/supabase";

function mapPerms(row: Record<string, unknown>, meta: {
  key_id: string;
  label: string;
  rate_limit_per_minute: number;
  expires_at: string;
}): AdminReadPermissions {
  return {
    key_id: meta.key_id,
    label: meta.label,
    rate_limit_per_minute: meta.rate_limit_per_minute,
    expires_at: meta.expires_at,
    allow_candidates: Boolean(row.allow_candidates),
    allow_tm001: Boolean(row.allow_tm001),
    allow_tm002: Boolean(row.allow_tm002),
    allow_calendar: Boolean(row.allow_calendar),
  };
}

export async function authenticateAdminReadRequest(
  authHeader: string | null
): Promise<
  | { ok: true; ctx: AdminReadAuthContext }
  | {
      ok: false;
      reason: "missing" | "invalid" | "wrong_key_type" | "revoked" | "expired" | "not_ready";
    }
> {
  const token = extractBearerToken(authHeader);
  if (!token) return { ok: false, reason: "missing" };
  if (isPartnerApiKeyFormat(token)) return { ok: false, reason: "wrong_key_type" };
  if (!isAdminReadApiKeyFormat(token)) return { ok: false, reason: "invalid" };

  const prefix = token.slice(0, 16);
  const hash = hashAdminReadApiKey(token);
  const supabase = getSupabaseAdmin();

  const { data: keyRow, error } = await supabase
    .from("admin_read_api_keys")
    .select("id, label, key_hash, revoked_at, expires_at, rate_limit_per_minute")
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    if (/admin_read_api_|schema cache|does not exist/i.test(error.message)) {
      return { ok: false, reason: "not_ready" };
    }
    return { ok: false, reason: "invalid" };
  }
  if (!keyRow) return { ok: false, reason: "invalid" };
  if (String(keyRow.key_hash) !== hash) return { ok: false, reason: "invalid" };

  if (new Date(String(keyRow.expires_at)).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const { data: permRow, error: permErr } = await supabase
    .from("admin_read_api_key_permissions")
    .select("*")
    .eq("key_id", keyRow.id)
    .maybeSingle();

  if (permErr) {
    if (/admin_read_api_|schema cache|does not exist/i.test(permErr.message)) {
      return { ok: false, reason: "not_ready" };
    }
    return { ok: false, reason: "invalid" };
  }
  if (!permRow) return { ok: false, reason: "invalid" };

  void supabase
    .from("admin_read_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  const permissions = mapPerms(permRow as Record<string, unknown>, {
    key_id: String(keyRow.id),
    label: String(keyRow.label ?? ""),
    rate_limit_per_minute: Number(keyRow.rate_limit_per_minute ?? 120),
    expires_at: String(keyRow.expires_at),
  });

  return {
    ok: true,
    ctx: {
      keyId: String(keyRow.id),
      label: String(keyRow.label ?? ""),
      rateLimitPerMinute: Number(keyRow.rate_limit_per_minute ?? 120),
      permissions,
    },
  };
}
