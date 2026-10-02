import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { getSupabaseAdmin } from "@/lib/supabase";

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return { error: NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 }) };
  if (session.rank !== "admin") {
    return { error: NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 }) };
  }
  return { session };
}

/** GET /api/admin/partner/clients */
export async function GET() {
  const gate = requireAdmin(await getSession());
  if ("error" in gate) return gate.error;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("partner_api_clients")
      .select("id, name, contact_email, notes, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      const msg = /partner_api_|schema cache|does not exist/i.test(error.message)
        ? "파트너 API 테이블이 없습니다. supabase/migrations/061_partner_api.sql 을 실행해 주세요."
        : error.message;
      return NextResponse.json({ ok: false, message: msg }, { status: 500 });
    }
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e) {
    console.error("GET /api/admin/partner/clients:", e);
    return NextResponse.json({ ok: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** POST /api/admin/partner/clients */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const gate = requireAdmin(session);
  if ("error" in gate) return gate.error;

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, message: "name이 필요합니다." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("partner_api_clients")
      .insert({
        name,
        contact_email: String(body.contact_email ?? "").trim(),
        notes: String(body.notes ?? "").trim(),
        is_active: body.is_active !== false,
      })
      .select("id, name, contact_email, notes, is_active, created_at")
      .single();
    if (error) throw new Error(error.message);

    await writeAdminAudit({
      actor: actorFromSession(session!),
      action: "partner_client.create",
      resourceType: "partner_api_client",
      resourceId: String(data.id),
      summary: `파트너 클라이언트 생성: ${name}`,
      detail: { contact_email: data.contact_email },
    });

    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
