import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { patchTm001Customer } from "@/lib/crm/tm001/store";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/tm001/[id] */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 접근할 수 있습니다." }, { status: 403 });
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

    const item = await patchTm001Customer(id, {
      status: body.status,
      product: body.product,
      memo: body.memo,
      comment_append: body.comment_append,
      comment_by: session.name,
      assignee_id: body.assignee_id,
    });

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("PATCH /api/admin/tm001/[id]:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }
}
