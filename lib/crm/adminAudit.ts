import type { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export type AuditActor = {
  userId: string | null;
  loginId: string;
  name: string;
  rank: string;
};

const SENSITIVE_KEYS = /password|secret|token|hash|authorization/i;

function sanitizeDetail(detail: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!detail) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitizeDetail(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function actorFromSession(session: SessionUser): AuditActor {
  return {
    userId: session.userId,
    loginId: session.loginId || "",
    name: session.name || "",
    rank: session.rank,
  };
}

function clientMeta(request?: Request | NextRequest | null): { ip: string | null; userAgent: string | null } {
  if (!request) return { ip: null, userAgent: null };
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    request.headers.get("x-real-ip") ||
    null;
  return {
    ip,
    userAgent: request.headers.get("user-agent"),
  };
}

/** 감사 로그 기록 (실패해도 본 요청을 막지 않음) */
export async function writeAdminAudit(opts: {
  actor: AuditActor | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  summary: string;
  detail?: Record<string, unknown> | null;
  request?: Request | NextRequest | null;
  success?: boolean;
}): Promise<void> {
  try {
    const { ip, userAgent } = clientMeta(opts.request);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("admin_audit_logs").insert({
      actor_user_id: opts.actor?.userId || null,
      actor_login_id: opts.actor?.loginId || "",
      actor_name: opts.actor?.name || "",
      actor_rank: opts.actor?.rank || "",
      action: opts.action,
      resource_type: opts.resourceType ?? null,
      resource_id: opts.resourceId ?? null,
      summary: opts.summary,
      detail: sanitizeDetail(opts.detail),
      ip,
      user_agent: userAgent,
      success: opts.success !== false,
    });
    if (error) {
      console.warn("[adminAudit]", error.message);
    }
  } catch (e) {
    console.warn("[adminAudit]", e instanceof Error ? e.message : e);
  }
}

/** 계정 관리 — 직원별 최근 성공 로그인 시각 (감사 로그 기준, 컬럼 미백필 시 보조) */
export async function loadLastLoginAtByStaffIds(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return map;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("actor_user_id, created_at")
      .eq("action", "login")
      .eq("success", true)
      .in("actor_user_id", ids)
      .order("created_at", { ascending: false })
      .limit(Math.min(ids.length * 200, 5000));

    if (error || !data) return map;

    for (const row of data) {
      const id = String(row.actor_user_id ?? "");
      if (!id || map.has(id)) continue;
      map.set(id, String(row.created_at));
      if (map.size >= ids.length) break;
    }
  } catch (e) {
    console.warn("[adminAudit] loadLastLoginAtByStaffIds:", e instanceof Error ? e.message : e);
  }

  return map;
}

export function summarizeLeadPatch(body: Record<string, unknown>): string {
  const parts: string[] = [];
  if (body.assignee_id !== undefined) {
    parts.push(body.assignee_id ? "담당자 변경" : "담당자 해제");
  }
  if (body.status != null) parts.push(`상태→${String(body.status)}`);
  if (body.memo != null) parts.push("메모 수정");
  if (body.admin_comment != null) parts.push("코멘트 수정");
  if (body.meeting_at !== undefined) parts.push("대면일정 변경");
  return parts.length ? parts.join(", ") : "리드 수정";
}
