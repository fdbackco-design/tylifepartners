import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { buildMergePreview } from "@/lib/crm/merge/preview";
import { executeAutoMerges } from "@/lib/crm/merge/execute";
import { getSupabaseAdmin } from "@/lib/supabase";

function parseTable(raw: string | null): "leads" | "tylife_b2b" {
  return raw === "tylife_b2b" || raw === "candidates" ? "tylife_b2b" : "leads";
}

/** GET: dry-run 미리보기 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }
  const table = parseTable(request.nextUrl.searchParams.get("table"));
  try {
    const preview = await buildMergePreview(table);
    const supabase = getSupabaseAdmin();
    const { data: job } = await supabase
      .from("lead_merge_jobs")
      .insert({
        lead_table: table,
        mode: "dry_run",
        status: "completed",
        executed_by: session.userId,
        executed_by_name: session.name,
        summary: {
          group_count: preview.group_count,
          mergeable_group_count: preview.mergeable_group_count,
          review_group_count: preview.review_group_count,
        },
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (job?.id) {
      const rows = preview.groups.map((g) => ({
        job_id: job.id,
        lead_table: table,
        normalized_phone: g.normalized_phone,
        primary_lead_id: g.primary.id,
        source_lead_ids: g.sources.map((s) => s.id),
        primary_selection_reason: g.primary_selection_reason,
        auto_merge: g.auto_merge,
        status: "preview" as const,
        skip_reasons: g.skip_reasons,
        before_summary: {
          related: g.related,
          conflicts: g.conflicts,
          memo_blocks_to_add: g.memo_blocks_to_add,
          assignment_logs_to_move: g.assignment_logs_to_move,
          members: g.members.map((m) => ({ id: m.id, name: m.name, created_at: m.created_at })),
        },
        moved_counts: {},
      }));
      if (rows.length) {
        await supabase.from("lead_merge_group_logs").insert(rows);
      }
    }

    return NextResponse.json({ ok: true, job_id: job?.id ?? null, preview });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/** POST: 미리보기 승인 후 실제 병합 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const table = parseTable(body.table ?? null);
    if (!body.confirm) {
      return NextResponse.json(
        { ok: false, message: "confirm: true 로 승인해 주세요. 먼저 GET 미리보기를 확인하세요." },
        { status: 400 }
      );
    }
    const phones = Array.isArray(body.phones)
      ? body.phones.map((p: unknown) => String(p).replace(/\D/g, "")).filter(Boolean)
      : undefined;
    const result = await executeAutoMerges({
      table,
      session,
      phones,
      confirm_token: body.preview_job_id ? String(body.preview_job_id) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
