import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import {
  createAdminReadApiKeyRecord,
  type CreateAdminReadKeyInput,
} from "@/lib/adminRead/keysAdmin";
import { getSupabaseAdmin } from "@/lib/supabase";

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return { error: NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 }) };
  if (session.rank !== "admin") {
    return { error: NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 }) };
  }
  return { session };
}

function validateInput(body: CreateAdminReadKeyInput): string | null {
  if (
    body.allow_candidates === false &&
    body.allow_tm001 === false &&
    body.allow_tm002 === false &&
    body.allow_calendar === false
  ) {
    return "allow_candidates, allow_tm001, allow_tm002, allow_calendar 중 하나 이상을 켜야 합니다.";
  }
  if (!body.expires_at?.trim()) {
    return "expires_at(ISO, 미래)가 필요합니다.";
  }
  return null;
}

/** GET /api/admin/admin-read/keys */
export async function GET() {
  const gate = requireAdmin(await getSession());
  if ("error" in gate) return gate.error;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("admin_read_api_keys")
      .select(
        "id, label, key_prefix, revoked_at, expires_at, rate_limit_per_minute, created_at, last_used_at, created_by"
      )
      .order("created_at", { ascending: false });

    if (error) {
      const msg = /admin_read_api_|schema cache|does not exist/i.test(error.message)
        ? "관리자 읽기 API 테이블이 없습니다. supabase/migrations/063_admin_read_api.sql 을 실행해 주세요."
        : error.message;
      return NextResponse.json({ ok: false, message: msg }, { status: 500 });
    }

    const keyIds = (data ?? []).map((r) => String(r.id));
    const permByKey = new Map<string, Record<string, unknown>>();
    if (keyIds.length) {
      const { data: perms } = await supabase
        .from("admin_read_api_key_permissions")
        .select("*")
        .in("key_id", keyIds);
      for (const p of perms ?? []) {
        permByKey.set(String(p.key_id), p as Record<string, unknown>);
      }
    }

    const items = (data ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      key_prefix: row.key_prefix,
      revoked_at: row.revoked_at,
      expires_at: row.expires_at,
      rate_limit_per_minute: row.rate_limit_per_minute,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      created_by: row.created_by,
      permissions: permByKey.get(String(row.id)) ?? null,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("GET /api/admin/admin-read/keys:", e);
    return NextResponse.json({ ok: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** POST /api/admin/admin-read/keys — plaintext 키는 이 응답에서만 1회 표시 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const gate = requireAdmin(session);
  if ("error" in gate) return gate.error;

  try {
    const body = (await request.json()) as CreateAdminReadKeyInput;
    const err = validateInput(body);
    if (err) {
      return NextResponse.json({ ok: false, message: err }, { status: 400 });
    }

    const { keyId, plaintext, prefix } = await createAdminReadApiKeyRecord(body, session!.userId);

    await writeAdminAudit({
      actor: actorFromSession(session!),
      action: "admin_read_key.create",
      resourceType: "admin_read_api_key",
      resourceId: keyId,
      summary: `관리자 읽기 API 키 발급 (${prefix}…)`,
      detail: {
        allow_candidates: body.allow_candidates !== false,
        allow_tm001: body.allow_tm001 !== false,
        allow_tm002: body.allow_tm002 !== false,
        allow_calendar: body.allow_calendar !== false,
        expires_at: body.expires_at,
      },
    });

    return NextResponse.json({
      ok: true,
      key_id: keyId,
      key_prefix: prefix,
      api_key: plaintext,
      message: "api_key는 이 응답에서만 확인할 수 있습니다. 안전한 곳에 저장하세요.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
