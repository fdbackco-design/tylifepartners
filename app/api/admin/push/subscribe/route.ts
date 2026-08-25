import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

type PushSubscriptionJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

function parseSub(body: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!body || typeof body !== "object") return null;
  const sub = body as PushSubscriptionJSON;
  const endpoint = String(sub.endpoint ?? "").trim();
  const p256dh = String(sub.keys?.p256dh ?? "").trim();
  const auth = String(sub.keys?.auth ?? "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) return null;
  return { endpoint, p256dh, auth };
}

/** POST /api/admin/push/subscribe — 구독 등록/갱신 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseSub(body?.subscription ?? body);
  if (!parsed) {
    return NextResponse.json({ ok: false, message: "구독 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("web_push_subscriptions").upsert(
    {
      endpoint: parsed.endpoint,
      p256dh: parsed.p256dh,
      auth: parsed.auth,
      staff_user_id: session.userId,
      login_id: session.loginId || null,
      rank: session.rank,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("push subscribe:", error);
    const msg = /web_push_subscriptions|schema cache/i.test(error.message)
      ? "푸시 구독 테이블이 없습니다. 마이그레이션 027을 적용해 주세요."
      : "구독 저장에 실패했습니다.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/push/subscribe — 구독 해제 */
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const endpoint = String(body?.endpoint ?? "").trim();
  const supabase = getSupabaseAdmin();

  if (endpoint) {
    await supabase.from("web_push_subscriptions").delete().eq("endpoint", endpoint);
  } else if (session.userId) {
    await supabase.from("web_push_subscriptions").delete().eq("staff_user_id", session.userId);
  } else if (session.loginId) {
    await supabase.from("web_push_subscriptions").delete().eq("login_id", session.loginId);
  }

  return NextResponse.json({ ok: true });
}
