import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { visibleAssigneeIds, canAccessCrmLeads } from "@/lib/crm/scope";
import {
  clientMetaFromRequest,
  getLatestLeadConsent,
  insertLeadConsent,
  leadTypeForCategory,
  legacyMarketingConsentFlag,
  parseConsentFromBody,
  toConsentSummary,
  withdrawLeadConsent,
} from "@/lib/crm/leadConsents";
import { tableForCategory } from "@/lib/crm/status";
import type { LeadCategory } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

function categoryOf(request: NextRequest): LeadCategory {
  const cat = request.nextUrl.searchParams.get("category");
  return cat === "candidates" || cat === "b2b" ? "candidates" : "consumers";
}

async function assertLeadAccess(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, id: string, category: LeadCategory) {
  const table = tableForCategory(category);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from(table).select("id, assignee_id, marketing_consent").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false as const, status: 404, message: "리드를 찾을 수 없습니다." };
  const scoped = await visibleAssigneeIds(session);
  const assigneeId = (data as { assignee_id?: string | null }).assignee_id ?? null;
  if (scoped !== "all" && (!assigneeId || !scoped.includes(assigneeId))) {
    return { ok: false as const, status: 403, message: "권한이 없습니다." };
  }
  return { ok: true as const, table, row: data as { id: string; assignee_id: string | null; marketing_consent: number | null } };
}

/** GET — 최신 동의 + 이력 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canAccessCrmLeads(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  const { id } = await params;
  const category = categoryOf(request);
  const access = await assertLeadAccess(session, id, category);
  if (!access.ok) return NextResponse.json({ ok: false, message: access.message }, { status: access.status });

  const leadType = leadTypeForCategory(category);
  const latest = await getLatestLeadConsent(id, leadType);
  const supabase = getSupabaseAdmin();
  const { data: history, error } = await supabase
    .from("lead_consents")
    .select("*")
    .eq("lead_id", id)
    .eq("lead_type", leadType)
    .order("consented_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error && !/lead_consents|schema cache|does not exist/i.test(error.message)) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    consent: toConsentSummary(latest),
    history: history ?? [],
    legacy_marketing_consent: access.row.marketing_consent,
  });
}

/**
 * POST — 동의 변경 또는 철회 (append-only)
 * body: { action: "update" | "withdraw", ...consent fields }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canAccessCrmLeads(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  // 동의 변경/철회는 관리자·매니저만
  if (session.rank !== "admin" && session.rank !== "manager") {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const { id } = await params;
  const category = categoryOf(request);
  const access = await assertLeadAccess(session, id, category);
  if (!access.ok) return NextResponse.json({ ok: false, message: access.message }, { status: access.status });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "update").trim();
  const leadType = leadTypeForCategory(category);
  const clientMeta = clientMetaFromRequest(request);

  try {
    if (action === "withdraw") {
      const row = await withdrawLeadConsent({
        leadId: id,
        leadType,
        consentSource: body.consent_source != null ? String(body.consent_source) : "crm_withdraw",
        ipAddress: clientMeta.ip_address,
        userAgent: clientMeta.user_agent,
      });
      await getSupabaseAdmin()
        .from(access.table)
        .update({ marketing_consent: null })
        .eq("id", id);
      return NextResponse.json({ ok: true, consent: toConsentSummary(row), item: row });
    }

    const consent = {
      ...parseConsentFromBody(body, { defaultSource: "crm_update" }),
      ...clientMeta,
    };
    const row = await insertLeadConsent({ leadId: id, leadType, consent });
    await getSupabaseAdmin()
      .from(access.table)
      .update({ marketing_consent: legacyMarketingConsentFlag(consent) })
      .eq("id", id);
    return NextResponse.json({ ok: true, consent: toConsentSummary(row), item: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
