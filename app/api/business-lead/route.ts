import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { processBusinessLeadSideEffects } from "@/lib/businessLeadSideEffects";
import { parseSubmissionAnalytics } from "@/lib/landing-analytics/parseSubmissionAnalytics";
import { isLanding0623EntryPage, normalizeLanding0623EntryPage } from "@/lib/landing0623";
import { isLanding0715EntryPage, normalizeLanding0715EntryPage } from "@/lib/landing0715";
import { formatPhoneKorean } from "@/lib/phone";
import { isLeadSubmissionBlocked, maskPhoneForLog } from "@/lib/phoneBlacklist";
import { runAfterResponse } from "@/lib/runAfterResponse";
import { syncLeadToCrm } from "@/lib/crmSync";
import { tryAutoAssignLead } from "@/lib/crm/assignment";
import {
  DEFAULT_FORM_CONFIG,
  normalizeFormConfig,
  resolveAllowedRegions,
  type ManagedFormConfig,
} from "@/lib/managedLandings/formConfig";
import { getManagedLandingById } from "@/lib/managedLandings/store";
import { verifyAdminSession } from "@/lib/adminSession";
import { parseBaseRegion } from "@/lib/regions";

const INSURANCE_DESIGNER_JOB = "보험설계사";
const ALLOWED_JOB_RANKS = new Set(["지점장 이상", "팀장 이상", "FC"]);

function formatKstYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * POST /api/business-lead
 * /business 페이지 파트너 신청 → tylife_b2b 테이블 저장
 * [환경변수] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const source = String(body.source ?? "business").trim() || "business";
    const entryPageRaw = String(body.entry_page ?? "business").trim() || "business";
    const entryPage = isLanding0623EntryPage(entryPageRaw)
      ? normalizeLanding0623EntryPage(entryPageRaw)
      : isLanding0715EntryPage(entryPageRaw)
        ? normalizeLanding0715EntryPage(entryPageRaw)
        : entryPageRaw;
    const is0623Landing = isLanding0623EntryPage(entryPage);
    const utmSource = body.utm_source != null ? String(body.utm_source).trim() : null;
    const utmMedium = body.utm_medium != null ? String(body.utm_medium).trim() : null;
    const utmCampaign = body.utm_campaign != null ? String(body.utm_campaign).trim() : null;
    const utmContent = body.utm_content != null ? String(body.utm_content).trim() : null;
    const utmTerm = body.utm_term != null ? String(body.utm_term).trim() : null;
    const marketingConsent =
      body.marketing_consent === 1 || body.marketing_consent === "1" ? 1 : null;
    const region = body.region != null ? String(body.region).trim() : body.location != null ? String(body.location).trim() : "";
    const availableTime =
      body.available_time != null
        ? String(body.available_time).trim()
        : body.desired_time != null
          ? String(body.desired_time).trim()
          : "";
    const ageGroup = body.age_group != null ? String(body.age_group).trim() : "";
    const job = body.job != null ? String(body.job).trim() : "";
    const jobRankRaw = body.job_rank != null ? String(body.job_rank).trim() : "";

    if (!name) {
      return NextResponse.json(
        { ok: false, message: "이름을 입력해주세요." },
        { status: 400 }
      );
    }
    if (name.length < 2 || name.length > 10) {
      return NextResponse.json(
        { ok: false, message: "이름은 2~10자로 입력해주세요." },
        { status: 400 }
      );
    }
    if (phone.length < 10 || phone.length > 11) {
      return NextResponse.json(
        { ok: false, message: "연락처를 확인해주세요. (숫자 10~11자리)" },
        { status: 400 }
      );
    }
    // 차단 대상 연락처: DB 저장·구글 시트·담당자 분배·이메일·CRM 전부 건너뛰고 성공 응답만 반환
    if (isLeadSubmissionBlocked(phone)) {
      console.warn("[leadBlock] 차단 연락처 신청 차단(B2B):", maskPhoneForLog(phone));
      return NextResponse.json({ ok: true });
    }

    const phonePretty = formatPhoneKorean(phone);

    const analytics = parseSubmissionAnalytics(body as Record<string, unknown>);
    const landingIdRaw = body.landing_id != null ? String(body.landing_id).trim() : "";
    const landingId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        landingIdRaw
      )
        ? landingIdRaw
        : null;
    const landingPath =
      body.landing_path != null
        ? String(body.landing_path).trim() || null
        : landingId
          ? entryPage
          : null;

    // 관리형 랜딩: DB에 저장된 신청폼 양식 기준으로 필수 필드 판정
    // (관리자 미리보기에서는 저장 전 로컬 설정을 body.form_config로 보낼 수 있음)
    let formConfig: ManagedFormConfig = DEFAULT_FORM_CONFIG;
    if (landingId) {
      try {
        const managed = await getManagedLandingById(landingId);
        if (managed) formConfig = managed.form_config;
      } catch (e) {
        console.error("business-lead form_config lookup:", e);
      }
    }
    if (body.form_config != null && (await verifyAdminSession())) {
      formConfig = normalizeFormConfig(body.form_config);
    }

    if (!is0623Landing) {
      if (formConfig.includeRegion && !region) {
        return NextResponse.json(
          { ok: false, message: "지역을 선택해주세요." },
          { status: 400 }
        );
      }
      if (formConfig.includeRegion && region) {
        const allowed = resolveAllowedRegions(formConfig);
        const base = parseBaseRegion(region);
        if (!base || !allowed.includes(base)) {
          return NextResponse.json(
            { ok: false, message: "선택할 수 없는 지역입니다." },
            { status: 400 }
          );
        }
      }
      if (formConfig.includeAvailableTime && !availableTime) {
        return NextResponse.json(
          { ok: false, message: "상담가능시간을 선택해주세요." },
          { status: 400 }
        );
      }
      if (formConfig.includeAgeGroup && !ageGroup) {
        return NextResponse.json(
          { ok: false, message: "연령대를 선택해주세요." },
          { status: 400 }
        );
      }
    }

    const jobRankForDb =
      job === INSURANCE_DESIGNER_JOB && jobRankRaw && ALLOWED_JOB_RANKS.has(jobRankRaw) ? jobRankRaw : null;
    if (
      !is0623Landing &&
      formConfig.includeJob &&
      job === INSURANCE_DESIGNER_JOB &&
      !jobRankForDb
    ) {
      return NextResponse.json(
        { ok: false, message: "보험설계사인 경우 직급을 선택해주세요." },
        { status: 400 }
      );
    }

    const regionForDb = formConfig.includeRegion ? region || null : null;
    const availableTimeForDb = formConfig.includeAvailableTime ? availableTime || null : null;
    const ageGroupForDb = formConfig.includeAgeGroup ? ageGroup || null : null;
    const jobForDb = formConfig.includeJob ? job || null : null;
    const jobRankStored = formConfig.includeJob ? jobRankForDb : null;

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data: insertedLead, error } = await supabase.from("tylife_b2b").insert({
      name,
      phone,
      source: utmSource || source,
      entry_page: entryPage,
      landing_id: landingId,
      landing_path: landingPath,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      utm_term: utmTerm || null,
      marketing_consent: marketingConsent,
      region: regionForDb,
      available_time: availableTimeForDb,
      age_group: ageGroupForDb,
      job: jobForDb,
      job_rank: jobRankStored,
      analytics_session_id: analytics.analytics_session_id,
      max_scroll_depth: analytics.max_scroll_depth,
      last_section_name: analytics.last_section_name,
      last_section_label: analytics.last_section_label,
      status: "배정전",
      status_changed_at: nowIso,
    })
      // 저장되는 값·컬럼은 그대로. CRM 동기화용 submission_id/실제 접수 시각만 돌려받는다.
      .select("id, created_at")
      .single();

    if (error) {
      console.error("Supabase tylife_b2b insert error:", error);
      const isTableMissing =
        /table.*tylife_b2b|tylife_b2b.*(not found|does not exist)/i.test(error.message) ||
        /schema cache/i.test(error.message);
      const msg =
        process.env.NODE_ENV === "development" && isTableMissing
          ? "tylife_b2b 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 migrations/002_tylife_b2b.sql 실행 후 재시도해 주세요."
          : process.env.NODE_ENV === "development"
            ? `저장 실패: ${error.message}`
            : "저장 중 오류가 발생했습니다.";
      return NextResponse.json({ ok: false, message: msg }, { status: 500 });
    }

    if (insertedLead?.id) {
      await tryAutoAssignLead({
        table: "tylife_b2b",
        leadId: insertedLead.id,
        region: regionForDb,
      });
    }

    // 구글 시트·담당자 동기화·이메일은 응답 후 백그라운드 처리
    const sideEffects = processBusinessLeadSideEffects({
      dateKstYmd: formatKstYmd(new Date()),
      name,
      phone,
      phonePretty,
      source,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      entryPage,
      region: regionForDb ?? "",
      availableTime: availableTimeForDb ?? "",
      ageGroup: ageGroupForDb ?? "",
      job: jobForDb ?? "",
      jobRankForDb: jobRankStored,
    });

    // FEED Life CRM 동기화 — 위 백그라운드 체인(구글 시트 → 담당자 분배 → 이메일)이 전부 끝난 뒤
    // 마지막 단계로만 실행한다. 기존 처리가 실패하더라도 롤백하지 않고(finally), 기존 에러 전파도
    // 그대로 유지한다. (환경변수 미설정 시 syncLeadToCrm 내부에서 아무것도 하지 않음)
    const referrer = request.headers.get("referer");
    runAfterResponse(
      (async () => {
        try {
          await sideEffects;
        } finally {
          if (insertedLead?.id && insertedLead?.created_at) {
            await syncLeadToCrm(supabase, {
              submissionId: insertedLead.id,
              sourceTable: "tylife_b2b",
              customerName: name,
              phone, // 위에서 이미 replace(/\D/g, "") 처리된 숫자만의 값
              region: regionForDb,
              ageGroup: ageGroupForDb,
              occupation: jobForDb,
              inquiryType: null,
              message: null,
              // 필수 개인정보 동의에 체크하지 않으면 폼 제출 자체가 불가능한 구조
              privacyConsent: true,
              receivedAtIso: new Date(insertedLead.created_at).toISOString(),
              landingPage: entryPage,
              referrer,
              utmSource: utmSource || null,
              utmMedium: utmMedium || null,
              utmCampaign: utmCampaign || null,
              utmContent: utmContent || null,
              utmTerm: utmTerm || null,
            });
          }
        }
      })()
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("POST /api/business-lead error:", err);
    const msg =
      process.env.NODE_ENV === "development"
        ? `서버 오류: ${err.message}`
        : "저장 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
