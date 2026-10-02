import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import {
  createPartnerApiKeyRecord,
  type CreatePartnerKeyInput,
} from "@/lib/partner/keysAdmin";
import {
  hasCandidateRowScope,
  hasTm001RowScope,
  hasTm002RowScope,
} from "@/lib/partner/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return { error: NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 }) };
  if (session.rank !== "admin") {
    return { error: NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 }) };
  }
  return { session };
}

function validateScopes(input: CreatePartnerKeyInput): string | null {
  const perm = {
    candidate_utm_sources: input.candidate_utm_sources ?? [],
    candidate_entry_pages: input.candidate_entry_pages ?? [],
    candidate_regions: input.candidate_regions ?? [],
    tm001_batch_codes: input.tm001_batch_codes ?? [],
    tm002_batch_codes: input.tm002_batch_codes ?? [],
    calendar_event_types: input.calendar_event_types ?? [],
  };
  if (input.allow_candidates && !hasCandidateRowScope(perm)) {
    return "후보자 조회를 켜려면 utm_source, entry_page, region 중 하나 이상의 행 범위가 필요합니다.";
  }
  if (input.allow_tm001 && !hasTm001RowScope(perm)) {
    return "TM001 조회를 켜려면 tm001_batch_codes가 필요합니다.";
  }
  if (input.allow_tm002 && !hasTm002RowScope(perm)) {
    return "TM002 조회를 켜려면 tm002_batch_codes가 필요합니다.";
  }
  if (
    !input.allow_candidates &&
    !input.allow_tm001 &&
    !input.allow_tm002 &&
    !input.allow_calendar
  ) {
    return "allow_candidates, allow_tm001, allow_tm002, allow_calendar 중 하나 이상을 켜야 합니다.";
  }
  return null;
}

/** GET /api/admin/partner/keys?client_id= */
export async function GET(request: NextRequest) {
  const gate = requireAdmin(await getSession());
  if ("error" in gate) return gate.error;

  try {
    const clientId = request.nextUrl.searchParams.get("client_id")?.trim();
    const supabase = getSupabaseAdmin();
    let qb = supabase
      .from("partner_api_keys")
      .select(
        "id, client_id, label, key_prefix, revoked_at, expires_at, rate_limit_per_minute, created_at, last_used_at"
      )
      .order("created_at", { ascending: false });
    if (clientId) qb = qb.eq("client_id", clientId);

    const { data, error } = await qb;
    if (error) {
      const msg = /partner_api_|schema cache|does not exist/i.test(error.message)
        ? "파트너 API 테이블이 없습니다. supabase/migrations/061_partner_api.sql 을 실행해 주세요."
        : error.message;
      return NextResponse.json({ ok: false, message: msg }, { status: 500 });
    }

    const keyIds = (data ?? []).map((r) => String(r.id));
    const permByKey = new Map<string, Record<string, unknown>>();
    if (keyIds.length) {
      const { data: perms } = await supabase
        .from("partner_api_key_permissions")
        .select("*")
        .in("key_id", keyIds);
      for (const p of perms ?? []) {
        permByKey.set(String(p.key_id), p as Record<string, unknown>);
      }
    }

    const items = (data ?? []).map((row) => ({
      id: row.id,
      client_id: row.client_id,
      label: row.label,
      key_prefix: row.key_prefix,
      revoked_at: row.revoked_at,
      expires_at: row.expires_at,
      rate_limit_per_minute: row.rate_limit_per_minute,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      permissions: permByKey.get(String(row.id)) ?? null,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("GET /api/admin/partner/keys:", e);
    return NextResponse.json({ ok: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** POST /api/admin/partner/keys — plaintext 키는 이 응답에서만 1회 표시 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const gate = requireAdmin(session);
  if ("error" in gate) return gate.error;

  try {
    const body = (await request.json()) as CreatePartnerKeyInput;
    const clientId = String(body.client_id ?? "").trim();
    if (!clientId) {
      return NextResponse.json({ ok: false, message: "client_id가 필요합니다." }, { status: 400 });
    }

    const scopeErr = validateScopes(body);
    if (scopeErr) {
      return NextResponse.json({ ok: false, message: scopeErr }, { status: 400 });
    }

    const { keyId, plaintext, prefix } = await createPartnerApiKeyRecord(body, session!.userId);

    await writeAdminAudit({
      actor: actorFromSession(session!),
      action: "partner_key.create",
      resourceType: "partner_api_key",
      resourceId: keyId,
      summary: `파트너 API 키 발급 (${prefix}…)`,
      detail: {
        client_id: clientId,
        allow_candidates: Boolean(body.allow_candidates),
        allow_tm001: Boolean(body.allow_tm001),
        allow_tm002: Boolean(body.allow_tm002),
        allow_calendar: Boolean(body.allow_calendar),
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
