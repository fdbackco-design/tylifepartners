import type { getSupabaseAdmin } from "@/lib/supabase";

/**
 * FEED Life CRM(별도 Supabase 프로젝트) 유입 동기화.
 * docs/crm-integration/FEED_Life_CRM_투트랙연동_개발가이드.md 기준.
 *
 * [환경변수] CRM_LANDING_INGEST_URL, CRM_LANDING_INGEST_SECRET (서버 전용 — NEXT_PUBLIC_ 금지)
 *
 * 반드시 지킬 것:
 * - 서버(API Route)에서만 실행한다. 브라우저에서 직접 호출하지 않는다.
 * - 기존 DB 저장 → 기존 Sheets 저장 → 기존 담당자분배/이메일이 전부 끝난 뒤 마지막에만 호출한다.
 * - 이 호출이 실패해도 위 기존 처리들을 롤백하지 않는다.
 * - 응답을 기다리느라 고객에게 보내는 "신청 성공" 응답을 지연시키지 않는다(runAfterResponse 사용).
 *
 * 주의: 여기서 말하는 CRM은 lib/googleSheets.ts의 "CRM 시트"(구글 시트 탭)와 무관한 별개 시스템이다.
 */

/** 동기화 대상 원본 테이블 (crm_sync_status.source_table CHECK 제약과 동일) */
type CrmSourceTable = "leads" | "tylife_b2b";

/** 서버 전용 Supabase admin 클라이언트 (lib/supabase.ts) */
type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export type CrmSyncPayload = {
  submissionId: string; // leads.id 또는 tylife_b2b.id (UUID) - 멱등성 키
  sourceTable: CrmSourceTable;
  customerName: string;
  phone: string; // 숫자만
  region?: string | null;
  ageGroup?: string | null;
  occupation?: string | null;
  inquiryType?: string | null;
  message?: string | null;
  privacyConsent: boolean;
  receivedAtIso: string; // 실제 고객 신청 시각(서버 처리 시각 아님)
  landingPage?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
};

const CRM_CALL_TIMEOUT_MS = 8000;

function isCrmSyncConfigured(): boolean {
  return Boolean(
    process.env.CRM_LANDING_INGEST_URL && process.env.CRM_LANDING_INGEST_SECRET
  );
}

/**
 * CRM Edge Function 호출. 실패해도 예외를 던지지 않고 상태 문자열로 반환한다
 * (호출부가 기존 처리를 롤백하지 않도록 하기 위함).
 */
async function callCrmIngest(
  payload: CrmSyncPayload
): Promise<{ status: string; result: unknown; error: string | null }> {
  const url = process.env.CRM_LANDING_INGEST_URL!;
  const secret = process.env.CRM_LANDING_INGEST_SECRET!;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRM_CALL_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-landing-ingest-secret": secret,
      },
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
      // CRM은 소문자 snake_case(synced_new_lead 등)로 반환한다. 회사 DB의
      // crm_sync_status CHECK 제약이 대문자 상수이므로 반드시 여기서 정규화해서 저장한다.
      return {
        status: String((body as { status: unknown }).status).toUpperCase(),
        result: body,
        error: null,
      };
    }

    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    return { status: "PENDING_RETRY", result: body, error: message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { status: "PENDING_RETRY", result: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * crm_sync_status 테이블에 결과 기록. 이 기록 자체가 실패해도(테이블 미적용 등)
 * 위에서 이미 끝난 기존 DB/Sheets/이메일 처리에는 영향을 주지 않는다.
 */
async function recordCrmSyncStatus(
  supabase: SupabaseAdminClient,
  payload: CrmSyncPayload,
  outcome: { status: string; result: unknown; error: string | null }
): Promise<void> {
  const isSynced = outcome.status !== "PENDING_RETRY";

  const { error } = await supabase.from("crm_sync_status").upsert(
    {
      submission_id: payload.submissionId,
      source_table: payload.sourceTable,
      crm_sync_status: outcome.status,
      crm_synced_at: isSynced ? new Date().toISOString() : null,
      crm_result: outcome.result,
      crm_last_error: outcome.error,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "submission_id" }
  );

  if (error) {
    console.error(
      "[crmSync] crm_sync_status 기록 실패(기존 흐름에는 영향 없음):",
      error.message
    );
  }
}

/**
 * 공통 진입점. B2C(/api/lead)와 B2B(/api/business-lead) 양쪽에서 동일하게 사용한다.
 * isCrmSyncConfigured()가 false면(환경변수 미설정) 조용히 아무것도 하지 않는다 —
 * 즉 이 환경변수 두 개를 넣기 전까지는 기존 동작과 100% 동일하다.
 *
 * 어떤 경우에도 예외를 던지지 않는다(기존 처리·고객 응답에 영향 금지).
 * 로그에는 고객 이름/전화번호를 남기지 않는다(submission_id만 사용).
 */
export async function syncLeadToCrm(
  supabase: SupabaseAdminClient,
  payload: CrmSyncPayload
): Promise<void> {
  if (!isCrmSyncConfigured()) return;

  try {
    const outcome = await callCrmIngest(payload);
    await recordCrmSyncStatus(supabase, payload, outcome);

    if (outcome.status === "PENDING_RETRY") {
      console.error("[crmSync] CRM 동기화 실패 - 재시도 대상으로 기록됨:", {
        submissionId: payload.submissionId,
        sourceTable: payload.sourceTable,
        error: outcome.error,
      });
    }
  } catch (e) {
    // callCrmIngest/recordCrmSyncStatus는 자체적으로 예외를 삼키지만,
    // 예상 못한 예외까지 여기서 막아 기존 흐름으로 절대 전파되지 않게 한다.
    const message = e instanceof Error ? e.message : String(e);
    console.error("[crmSync] 예상치 못한 오류(기존 흐름에는 영향 없음):", message);
  }
}
