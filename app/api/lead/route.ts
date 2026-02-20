import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/lead
 * 랜딩에서 상담 신청 리드 저장
 * [환경변수] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const source = String(body.source ?? "daangn").trim() || "daangn";
    const desiredDate = body.desired_date != null ? String(body.desired_date).trim() : null;
    const desiredTime = body.desired_time != null ? String(body.desired_time).trim() : null;
    const location = body.location != null ? String(body.location).trim() : null;

    // validation
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

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("leads").insert({
      name,
      phone,
      source,
      desired_date: desiredDate || null,
      desired_time: desiredTime || null,
      location: location || null,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      // leads 테이블 없음 시 안내
      const isTableMissing =
        /table.*leads|leads.*(not found|does not exist)/i.test(error.message) ||
        /schema cache/i.test(error.message);
      const msg =
        process.env.NODE_ENV === "development" && isTableMissing
          ? "leads 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 schema.sql 실행 후 재시도해 주세요."
          : process.env.NODE_ENV === "development"
            ? `저장 실패: ${error.message}`
            : "저장 중 오류가 발생했습니다.";
      return NextResponse.json({ ok: false, message: msg }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("POST /api/lead error:", err);
    const msg =
      process.env.NODE_ENV === "development"
        ? `서버 오류: ${err.message}`
        : "서버 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
