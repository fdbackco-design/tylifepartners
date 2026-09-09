import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { deleteTm001Customers } from "@/lib/crm/tm001/store";

/** POST /api/admin/tm001/delete — 선택 고객 삭제 (관리자) */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 삭제할 수 있습니다." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) {
      return NextResponse.json({ ok: false, message: "선택된 고객이 없습니다." }, { status: 400 });
    }
    const result = await deleteTm001Customers(ids, session);
    return NextResponse.json({
      ok: true,
      ...result,
      message: `${result.deleted}건을 삭제했습니다.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: /관리자|200건/.test(msg) ? 403 : 400 });
  }
}
