import { NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { buildCrmCheckup } from "@/lib/crm/checkup";

/** GET /api/admin/crm-checkup — 영업자 후속 업무 점검 요약 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  // 콜·상담을 하는 직급만
  if (!["sales", "manager", "tm_admin", "admin"].includes(session.rank)) {
    return NextResponse.json({ ok: true, items: [], total: 0, skipped: true });
  }

  try {
    const result = await buildCrmCheckup(session);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("GET /api/admin/crm-checkup:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
