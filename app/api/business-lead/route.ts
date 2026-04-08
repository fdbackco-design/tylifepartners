import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendLeadEmailNotification } from "@/lib/email";

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
    const entryPage = String(body.entry_page ?? "business").trim() || "business";
    const utmSource = body.utm_source != null ? String(body.utm_source).trim() : null;
    const utmMedium = body.utm_medium != null ? String(body.utm_medium).trim() : null;
    const utmCampaign = body.utm_campaign != null ? String(body.utm_campaign).trim() : null;
    const utmContent = body.utm_content != null ? String(body.utm_content).trim() : null;
    const marketingConsent =
      body.marketing_consent === 1 || body.marketing_consent === "1" ? 1 : null;
    const region = body.region != null ? String(body.region).trim() : "";
    const availableTime = body.available_time != null ? String(body.available_time).trim() : "";
    const ageGroup = body.age_group != null ? String(body.age_group).trim() : "";
    const job = body.job != null ? String(body.job).trim() : "";

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
    if (!region) {
      return NextResponse.json(
        { ok: false, message: "지역을 선택해주세요." },
        { status: 400 }
      );
    }
    if (!availableTime) {
      return NextResponse.json(
        { ok: false, message: "상담가능시간을 선택해주세요." },
        { status: 400 }
      );
    }
    if (!ageGroup) {
      return NextResponse.json(
        { ok: false, message: "연령대를 선택해주세요." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("tylife_b2b").insert({
      name,
      phone,
      source: utmSource || source,
      entry_page: entryPage,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      marketing_consent: marketingConsent,
      region,
      available_time: availableTime,
      age_group: ageGroup,
      job: job || null,
    });

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

    // 이메일 알림 (실패해도 제출 성공은 유지)
    const emailResult = await sendLeadEmailNotification({
      kind: "b2b",
      name,
      phone,
      createdAtIso: new Date().toISOString(),
      adminUrl: "https://www.tylifepartners.com/admin",
      entry_page: entryPage,
      region: region || null,
      available_time: availableTime || null,
      age_group: ageGroup || null,
      job: job || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
    });
    if (!emailResult.ok && !emailResult.skipped) {
      console.error("Business lead email notify failed:", emailResult.error);
    }

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
