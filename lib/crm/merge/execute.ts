import {
  inboundPayloadForGroup,
  resolveAssigneeForMerge,
  buildMergePreview,
  type LeadTable,
  type DuplicateGroupPreview,
} from "@/lib/crm/merge/preview";
import { mergeMemos } from "@/lib/crm/merge/logic";
import type { SessionUser } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export type ExecuteMergeResult = {
  job_id: string;
  lead_table: LeadTable;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  results: Array<{
    normalized_phone: string;
    status: "success" | "failed" | "skipped";
    primary_lead_id?: string;
    source_lead_ids?: string[];
    error?: string;
    moved?: Record<string, unknown>;
  }>;
};

async function ensureNormalizedPhones(table: LeadTable) {
  // best-effort backfill via select+update for rows missing normalized_phone
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from(table)
    .select("id, phone, normalized_phone")
    .or("normalized_phone.is.null,normalized_phone.eq.")
    .limit(5000);
  for (const row of data ?? []) {
    const digits = String(row.phone ?? "").replace(/\D/g, "");
    if (!digits) continue;
    await supabase.from(table).update({ normalized_phone: digits }).eq("id", row.id);
  }
}

export async function executeAutoMerges(opts: {
  table: LeadTable;
  session: SessionUser;
  /** 특정 번호만 실행. 없으면 자동병합 가능 그룹 전부 */
  phones?: string[];
  /** dry_run 미리보기 job에 묶을 때 */
  confirm_token?: string;
}): Promise<ExecuteMergeResult> {
  await ensureNormalizedPhones(opts.table);
  const preview = await buildMergePreview(opts.table);
  const targets = preview.groups.filter((g) => {
    if (!g.auto_merge) return false;
    if (opts.phones?.length) return opts.phones.includes(g.normalized_phone);
    return true;
  });

  const supabase = getSupabaseAdmin();
  const { data: job, error: jobErr } = await supabase
    .from("lead_merge_jobs")
    .insert({
      lead_table: opts.table,
      mode: "execute",
      status: "running",
      executed_by: opts.session.userId,
      executed_by_name: opts.session.name,
      summary: {
        confirm_token: opts.confirm_token ?? null,
        planned_groups: targets.length,
      },
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    throw new Error(jobErr?.message || "병합 작업 생성 실패");
  }

  const jobId = job.id as string;
  const results: ExecuteMergeResult["results"] = [];
  let success = 0;
  let failed = 0;
  let skipped = 0;

  // 검토 대상 로그
  for (const g of preview.groups.filter((x) => !x.auto_merge)) {
    if (opts.phones?.length && !opts.phones.includes(g.normalized_phone)) continue;
    await supabase.from("lead_merge_group_logs").upsert(
      {
        job_id: jobId,
        lead_table: opts.table,
        normalized_phone: g.normalized_phone,
        primary_lead_id: g.primary.id,
        source_lead_ids: g.sources.map((s) => s.id),
        primary_selection_reason: g.primary_selection_reason,
        auto_merge: false,
        status: "skipped",
        skip_reasons: g.skip_reasons,
        before_summary: {
          member_ids: g.members.map((m) => m.id),
          related: g.related,
          conflicts: g.conflicts,
        },
        moved_counts: {},
      },
      { onConflict: "job_id,lead_table,normalized_phone" }
    );
    skipped += 1;
    results.push({
      normalized_phone: g.normalized_phone,
      status: "skipped",
      primary_lead_id: g.primary.id,
      source_lead_ids: g.sources.map((s) => s.id),
      error: g.skip_reasons.join(","),
    });
  }

  for (const g of targets) {
    try {
      const moved = await mergeOneGroup(opts.table, g, jobId);
      success += 1;
      results.push({
        normalized_phone: g.normalized_phone,
        status: "success",
        primary_lead_id: g.primary.id,
        source_lead_ids: g.sources.map((s) => s.id),
        moved,
      });
    } catch (e) {
      failed += 1;
      const message = e instanceof Error ? e.message : String(e);
      await supabase.from("lead_merge_group_logs").upsert(
        {
          job_id: jobId,
          lead_table: opts.table,
          normalized_phone: g.normalized_phone,
          primary_lead_id: g.primary.id,
          source_lead_ids: g.sources.map((s) => s.id),
          primary_selection_reason: g.primary_selection_reason,
          auto_merge: true,
          status: "failed",
          skip_reasons: [],
          before_summary: { related: g.related, conflicts: g.conflicts },
          moved_counts: {},
          error_message: message,
        },
        { onConflict: "job_id,lead_table,normalized_phone" }
      );
      results.push({
        normalized_phone: g.normalized_phone,
        status: "failed",
        primary_lead_id: g.primary.id,
        source_lead_ids: g.sources.map((s) => s.id),
        error: message,
      });
    }
  }

  const status = failed === 0 ? "completed" : success > 0 ? "partial" : "failed";
  await supabase
    .from("lead_merge_jobs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      summary: {
        success_count: success,
        failed_count: failed,
        skipped_count: skipped,
        confirm_token: opts.confirm_token ?? null,
      },
    })
    .eq("id", jobId);

  return {
    job_id: jobId,
    lead_table: opts.table,
    success_count: success,
    failed_count: failed,
    skipped_count: skipped,
    results,
  };
}

async function mergeOneGroup(
  table: LeadTable,
  g: DuplicateGroupPreview,
  jobId: string
): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();
  const memberIds = g.members.map((m) => m.id);
  const assignee = await resolveAssigneeForMerge(table, g.primary, memberIds);
  const memo = mergeMemos(g.primary, g.sources);
  const inbound = inboundPayloadForGroup(g.primary, g.sources);

  const { data, error } = await supabase.rpc("merge_duplicate_lead_group", {
    p_lead_table: table,
    p_primary_id: g.primary.id,
    p_source_ids: g.sources.map((s) => s.id),
    p_merged_memo: memo,
    p_assignee_id: assignee.assigneeId,
    p_assigned_at: assignee.assignedAt,
    p_job_id: jobId,
    p_normalized_phone: g.normalized_phone,
    p_primary_reason: g.primary_selection_reason,
    p_before_summary: {
      member_ids: memberIds,
      related: g.related,
      names: g.members.map((m) => ({ id: m.id, name: m.name })),
    },
    p_inbound_rows: inbound,
  });

  if (error) throw new Error(error.message);
  const moved = (data as { moved?: Record<string, unknown> })?.moved ?? {};
  return moved;
}

/** 병합된 리드 수정/배정 차단 */
export async function assertLeadMutable(table: LeadTable, id: string): Promise<
  | { ok: true }
  | { ok: false; message: string; merged_into_id?: string | null }
> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(table)
    .select("id, merge_status, merged_into_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return { ok: false, message: "리드를 찾을 수 없습니다." };
  if ((data as { merge_status?: string }).merge_status === "merged") {
    return {
      ok: false,
      message: "병합된 고객은 수정·배정할 수 없습니다. 대표 고객을 열어 주세요.",
      merged_into_id: (data as { merged_into_id?: string | null }).merged_into_id,
    };
  }
  return { ok: true };
}
