import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncLeadToCrm } from "@/lib/crmSync";

const MAX_RETRY_BATCH = 50;

/**
 * POST /api/admin/crm-sync/retry
 * body: { submissionId?: string } - 없으면 PENDING_RETRY 상태인 건을 최대
 * MAX_RETRY_BATCH건까지 일괄 재시도한다. ingest_landing_lead()가 submission_id
 * 기준으로 멱등이므로 여러 번 재시도해도 CRM 쪽 중복은 생기지 않는다.
 *
 * leads/tylife_b2b 원본 테이블에서 재구성 가능한 필드만으로 재시도한다 -
 * leads 테이블에는 age_group/job 컬럼 자체가 없어(B2C 폼은 저장하지 않음)
 * 최초 시도 때와 달리 그 필드들은 비어서 재전송될 수 있다.
 */
export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  let submissionId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    submissionId = body?.submissionId ? String(body.submissionId).trim() : null;
  } catch {
    // body 없이 호출된 경우(전체 재시도) 무시
  }

  let query = supabase
    .from("crm_sync_status")
    .select("submission_id, source_table")
    .eq("crm_sync_status", "PENDING_RETRY")
    .order("created_at", { ascending: true })
    .limit(MAX_RETRY_BATCH);

  if (submissionId) {
    query = supabase
      .from("crm_sync_status")
      .select("submission_id, source_table")
      .eq("submission_id", submissionId);
  }

  const { data: pending, error: pendingError } = await query;
  if (pendingError) {
    return NextResponse.json({ ok: false, message: pendingError.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, retried: 0, message: "재시도할 건이 없습니다." });
  }

  let retried = 0;
  for (const row of pending) {
    if (row.source_table === "tylife_b2b") {
      const { data: lead } = await supabase
        .from("tylife_b2b")
        .select("name, phone, region, age_group, job, job_rank, entry_page, utm_source, utm_medium, utm_campaign, utm_content, created_at")
        .eq("id", row.submission_id)
        .maybeSingle();
      if (!lead) continue;
      await syncLeadToCrm({
        submissionId: row.submission_id,
        sourceTable: "tylife_b2b",
        customerName: lead.name,
        phone: lead.phone,
        region: lead.region,
        ageGroup: lead.age_group,
        occupation: lead.job,
        inquiryType: lead.job_rank,
        privacyConsent: true,
        receivedAtIso: lead.created_at,
        landingPage: lead.entry_page,
        utmSource: lead.utm_source,
        utmMedium: lead.utm_medium,
        utmCampaign: lead.utm_campaign,
        utmContent: lead.utm_content,
      });
      retried++;
    } else {
      const { data: lead } = await supabase
        .from("leads")
        .select("name, phone, location, desired_date, desired_time, entry_page, utm_source, utm_medium, utm_campaign, utm_content, created_at")
        .eq("id", row.submission_id)
        .maybeSingle();
      if (!lead) continue;
      await syncLeadToCrm({
        submissionId: row.submission_id,
        sourceTable: "leads",
        customerName: lead.name,
        phone: lead.phone,
        region: lead.location,
        message:
          [
            lead.desired_date ? `희망 상담일: ${lead.desired_date}` : null,
            lead.desired_time ? `희망 상담시간: ${lead.desired_time}` : null,
            lead.location ? `사는 위치: ${lead.location}` : null,
          ]
            .filter(Boolean)
            .join(", ") || null,
        privacyConsent: true,
        receivedAtIso: lead.created_at,
        landingPage: lead.entry_page,
        utmSource: lead.utm_source,
        utmMedium: lead.utm_medium,
        utmCampaign: lead.utm_campaign,
        utmContent: lead.utm_content,
      });
      retried++;
    }
  }

  return NextResponse.json({ ok: true, retried });
}
