import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

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
    const { error } = await supabase.from("tylife_b2b").insert({
      name,
      phone,
      source,
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
