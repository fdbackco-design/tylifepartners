import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import {
  getTm001CustomerById,
  isTm001CustomerVisible,
  patchTm001Customer,
} from "@/lib/crm/tm001/store";
import { canChangeAssignee, visibleAssigneeIds } from "@/lib/crm/scope";

type Ctx = { params: Promise<{ id: string }> };

function canAccessTm001(rank: string | undefined): boolean {
  return rank === "admin" || rank === "manager" || rank === "sales";
}

/** PATCH /api/admin/tm001/[id] */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canAccessTm001(session.rank)) {
    return NextResponse.json({ ok: false, message: "접근 권한이 없습니다." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });

  try {
    const body = (await request.json()) as {
      status?: string;
      product?: string | null;
      memo?: string;
      comment_append?: string;
      assignee_id?: string | null;
    };

    if (body.assignee_id !== undefined && !canChangeAssignee(session)) {
      return NextResponse.json({ ok: false, message: "담당자를 변경할 권한이 없습니다." }, { status: 403 });
    }

    const scoped = await visibleAssigneeIds(session);
    const current = await getTm001CustomerById(id, { includeStays: false });
    if (!current) return NextResponse.json({ ok: false, message: "고객을 찾을 수 없습니다." }, { status: 404 });
    if (!isTm001CustomerVisible(current, scoped)) {
      return NextResponse.json({ ok: false, message: "해당 고객을 볼 권한이 없습니다." }, { status: 403 });
    }

    const item = await patchTm001Customer(
      id,
      {
        status: body.status,
        product: body.product,
        memo: body.memo,
        comment_append: body.comment_append,
        comment_by: session.name,
        assignee_id: body.assignee_id,
      },
      session
    );

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /권한/.test(msg) ? 403 : 400;
    console.error("PATCH /api/admin/tm001/[id]:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status });
  }
}
