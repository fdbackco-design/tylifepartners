import { getSupabaseAdmin } from "@/lib/supabase";

// FEED Life CRM(별도 Supabase 프로젝트, GitHub tylifepartners-crm 저장소)으로의
// 유입 동기화. 이 파일이 실패해도 이미 끝난 DB/Google Sheets/이메일 처리에는
// 절대 영향을 주지 않는다 - 항상 기존 처리가 전부 끝난 뒤 마지막 단계로만
// 호출되고, 실패 시 crm_sync_status에 PENDING_RETRY로 기록될 뿐이다.

export type CrmSyncSourceTable = "leads" | "tylife_b2b";

export type CrmSyncPayload = {
  submissionId: string;
  sourceTable: CrmSyncSourceTable;
  customerName: string;
  phone: string;
  region?: string | null;
  ageGroup?: string | null;
  occupation?: string | null;
  inquiryType?: string | null;
  message?: string | null;
  privacyConsent: boolean;
  receivedAtIso: string;
  landingPage?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
};

function env(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const t = v.trim();
  return t ? t : null;
}

export function isCrmSyncConfigured(): boolean {
  return Boolean(env("CRM_LANDING_INGEST_URL") && env("CRM_LANDING_INGEST_SECRET"));
}

async function callCrmIngest(
  payload: CrmSyncPayload
): Promise<{ status: string; result: unknown; error: string | null }> {
  const url = env("CRM_LANDING_INGEST_URL")!;
  const secret = env("CRM_LANDING_INGEST_SECRET")!;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-landing-ingest-secret": secret },
      body: JSON.stringify({
        submission_id: payload.submissionId,
        customer_name: payload.customerName,
        phone: payload.phone,
        region: payload.region ?? null,
        age_group: payload.ageGroup ?? null,
        occupation: payload.occupation ?? null,
        inquiry_type: payload.inquiryType ?? null,
        message: payload.message ?? null,
        privacy_consent: payload.privacyConsent,
        received_at: payload.receivedAtIso,
        landing_page: payload.landingPage ?? null,
        referrer: payload.referrer ?? null,
        utm_source: payload.utmSource ?? null,
        utm_medium: payload.utmMedium ?? null,
        utm_campaign: payload.utmCampaign ?? null,
        utm_content: payload.utmContent ?? null,
        utm_term: payload.utmTerm ?? null,
      }),
    });

    const body = await res.json().catch(() => null);

    if (res.ok && body && typeof body === "object" && "status" in body) {
      // CRM RPC는 소문자 snake_case(synced_new_lead 등)를 반환한다 -
      // crm_sync_status.crm_sync_status CHECK 제약은 대문자 상수라 정규화한다.
      return { status: String((body as { status: unknown }).status).toUpperCase(), result: body, error: null };
    }

    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    return { status: "PENDING_RETRY", result: body, error: message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { status: "PENDING_RETRY", result: null, error: message };
  }
}

async function recordCrmSyncStatus(
  payload: CrmSyncPayload,
  outcome: { status: string; result: unknown; error: string | null }
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("crm_sync_status")
    .select("crm_retry_count")
    .eq("submission_id", payload.submissionId)
    .maybeSingle();

  const isSynced = outcome.status !== "PENDING_RETRY";
  const nextRetryCount = (existing?.crm_retry_count ?? 0) + (outcome.status === "PENDING_RETRY" ? 1 : 0);

  const { error } = await supabase.from("crm_sync_status").upsert(
    {
      submission_id: payload.submissionId,
      source_table: payload.sourceTable,
      crm_sync_status: outcome.status,
      crm_synced_at: isSynced ? new Date().toISOString() : null,
      crm_result: outcome.result,
      crm_retry_count: nextRetryCount,
      crm_last_error: outcome.error,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "submission_id" }
  );

  if (error) {
    // crm_sync_status 테이블 자체가 아직 없거나(마이그레이션 미적용) 기록에
    // 실패해도, 이미 끝난 기존 DB/Sheets/이메일 처리에는 영향을 주지 않는다.
    console.error("[crmSync] crm_sync_status 기록 실패(기존 흐름에는 영향 없음):", error.message);
  }
}

export async function syncLeadToCrm(payload: CrmSyncPayload): Promise<void> {
  if (!isCrmSyncConfigured()) {
    return;
  }

  const outcome = await callCrmIngest(payload);
  await recordCrmSyncStatus(payload, outcome);

  if (outcome.status === "PENDING_RETRY") {
    console.error("[crmSync] CRM 동기화 실패 - 재시도 대상으로 기록됨:", outcome.error);
  }
}
