import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

const STATUS_VALUES = ["대기", "상담 완료"] as const;

/**
 * PATCH /api/admin/leads/[id]
 * 리드의 상담 상태(status), 메모(memo) 업데이트
 * ?category=b2b → tylife_b2b 테이블, ?category=b2c 또는 생략 → leads 테이블
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json(
      { ok: false, message: "인증이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") === "b2b" ? "b2b" : "b2c";
    const tableName = category === "b2b" ? "tylife_b2b" : "leads";
    if (!id) {
      return NextResponse.json(
        { ok: false, message: "id가 필요합니다." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const status = body.status != null ? String(body.status).trim() : null;
    const memo = body.memo != null ? String(body.memo) : null;

    if (status !== null && !STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
      return NextResponse.json(
        { ok: false, message: "상태는 '대기' 또는 '상담 완료'만 가능합니다." },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    if (status !== null) update.status = status;
    if (memo !== null) update.memo = memo;

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { ok: false, message: "수정할 필드가 없습니다." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(tableName)
      .update(update)
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      console.error("Supabase lead update error:", error);
      return NextResponse.json(
        { ok: false, message: "업데이트 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, message: "해당 리드를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/admin/leads/[id] error:", e);
    return NextResponse.json(
      { ok: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
