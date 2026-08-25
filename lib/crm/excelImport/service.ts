import {
  isValidNormalizedPhone,
  isoToYmdKst,
  matchStaffByLabel,
  nameMismatch,
  planAssignmentLogs,
  planMemoBlocks,
  type ExcelImportRawRow,
  type StaffMatch,
} from "@/lib/crm/excelImport/logic";
import { parseBeforeDbWorkbook } from "@/lib/crm/excelImport/parse";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SessionUser } from "@/lib/crm/types";

export type LeadTable = "leads" | "tylife_b2b";

export type MatchedLead = {
  id: string;
  lead_table: LeadTable;
  name: string;
  phone: string;
  created_at: string;
  memo: string | null;
  assignee_id: string | null;
  merge_status: string | null;
  merged_into_id: string | null;
};

export type RowPreview = {
  excel_row_number: number;
  excel_name: string;
  excel_phone: string;
  normalized_phone: string;
  excel_inbound_date: string | null;
  status: "ready" | "warning" | "failed" | "skipped";
  reasons: string[];
  primary_lead_id: string | null;
  lead_table: LeadTable | null;
  lead_name: string | null;
  lead_created_ymd: string | null;
  assignment_to_apply: number[];
  assignment_to_skip: Array<{ step: number; reason: string }>;
  memo_to_apply: number[];
  memo_to_skip: Array<{ step: number; reason: string }>;
  unknown_assignees: string[];
  last_assignee_name: string | null;
};

async function loadStaff(): Promise<StaffMatch[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("staff_users").select("id, name").eq("is_active", true);
  return (data ?? []) as StaffMatch[];
}

async function resolvePrimaryByPhone(phone: string): Promise<{ lead: MatchedLead | null; warnings: string[] }> {
  const warnings: string[] = [];
  const supabase = getSupabaseAdmin();
  const tables: LeadTable[] = ["leads", "tylife_b2b"];
  const hits: MatchedLead[] = [];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("id, name, phone, created_at, memo, assignee_id, merge_status, merged_into_id, normalized_phone")
      .eq("normalized_phone", phone)
      .limit(20);
    if (error) {
      const { data: fb } = await supabase
        .from(table)
        .select("id, name, phone, created_at, memo, assignee_id, merge_status, merged_into_id")
        .eq("phone", phone)
        .limit(20);
      for (const row of fb ?? []) {
        hits.push({ ...(row as MatchedLead), lead_table: table });
      }
      continue;
    }
      for (const row of data ?? []) {
        hits.push({ ...(row as unknown as MatchedLead), lead_table: table });
      }
  }

  if (!hits.length) return { lead: null, warnings };

  // follow merged_into_id chain
  const resolveOne = async (hit: MatchedLead): Promise<MatchedLead> => {
    let cur = hit;
    const seen = new Set<string>();
    while (cur.merge_status === "merged" && cur.merged_into_id) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      const { data } = await supabase
        .from(cur.lead_table)
        .select("id, name, phone, created_at, memo, assignee_id, merge_status, merged_into_id")
        .eq("id", cur.merged_into_id)
        .maybeSingle();
      if (!data) {
        warnings.push(`병합 대상(merged_into_id)을 찾지 못함: ${cur.merged_into_id}`);
        break;
      }
      cur = { ...(data as MatchedLead), lead_table: cur.lead_table };
    }
    // also try other table if merge points across (shouldn't)
    return cur;
  };

  const resolved = [];
  for (const h of hits) {
    resolved.push(await resolveOne(h));
  }

  const active = resolved.filter((r) => (r.merge_status ?? "active") !== "merged");
  const pool = active.length ? active : resolved;
  // unique by id
  const uniq = Array.from(new Map(pool.map((r) => [r.id, r])).values());
  if (uniq.length > 1) {
    warnings.push(
      `동일 번호 활성 고객 ${uniq.length}건 → 최신 유입(created_at) 1건 사용 (${uniq.map((u) => u.id.slice(0, 8)).join(", ")})`
    );
    uniq.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  return { lead: uniq[0] ?? null, warnings };
}

export async function buildExcelImportPreview(buffer: Buffer, opts?: { uploadAt?: Date }) {
  const uploadAt = opts?.uploadAt ?? new Date();
  const parsed = parseBeforeDbWorkbook(buffer);
  const staff = await loadStaff();
  const resolve = (name: string) => matchStaffByLabel(name, staff).staff;

  const rowPreviews: RowPreview[] = [];
  for (const ex of parsed.excludedDuplicates) {
    rowPreviews.push({
      excel_row_number: ex.row.excelRowNumber,
      excel_name: ex.row.name,
      excel_phone: ex.row.phone,
      normalized_phone: ex.row.normalizedPhone,
      excel_inbound_date: ex.row.inboundDate,
      status: "skipped",
      reasons: [ex.reason],
      primary_lead_id: null,
      lead_table: null,
      lead_name: null,
      lead_created_ymd: null,
      assignment_to_apply: [],
      assignment_to_skip: [],
      memo_to_apply: [],
      memo_to_skip: [],
      unknown_assignees: [],
      last_assignee_name: null,
    });
  }

  for (const row of parsed.selected) {
    rowPreviews.push(await previewOneRow(row, staff, resolve, uploadAt));
  }

  rowPreviews.sort((a, b) => a.excel_row_number - b.excel_row_number);

  const summary = {
    total_rows: parsed.rows.length,
    selected_rows: parsed.selected.length,
    duplicate_excluded: parsed.excludedDuplicates.length,
    ready: rowPreviews.filter((r) => r.status === "ready").length,
    warning: rowPreviews.filter((r) => r.status === "warning").length,
    failed: rowPreviews.filter((r) => r.status === "failed").length,
    skipped: rowPreviews.filter((r) => r.status === "skipped").length,
  };

  return { summary, rows: rowPreviews, upload_at: uploadAt.toISOString() };
}

async function previewOneRow(
  row: ExcelImportRawRow,
  staff: StaffMatch[],
  resolve: (name: string) => StaffMatch | null,
  uploadAt: Date
): Promise<RowPreview> {
  const reasons: string[] = [];
  const unknown: string[] = [];

  if (!row.normalizedPhone || !isValidNormalizedPhone(row.normalizedPhone)) {
    return {
      excel_row_number: row.excelRowNumber,
      excel_name: row.name,
      excel_phone: row.phone,
      normalized_phone: row.normalizedPhone,
      excel_inbound_date: row.inboundDate,
      status: "failed",
      reasons: ["전화번호를 정규화·확정할 수 없습니다."],
      primary_lead_id: null,
      lead_table: null,
      lead_name: null,
      lead_created_ymd: null,
      assignment_to_apply: [],
      assignment_to_skip: [],
      memo_to_apply: [],
      memo_to_skip: [],
      unknown_assignees: [],
      last_assignee_name: null,
    };
  }

  const { lead, warnings } = await resolvePrimaryByPhone(row.normalizedPhone);
  reasons.push(...warnings);
  if (!lead) {
    return {
      excel_row_number: row.excelRowNumber,
      excel_name: row.name,
      excel_phone: row.phone,
      normalized_phone: row.normalizedPhone,
      excel_inbound_date: row.inboundDate,
      status: "failed",
      reasons: ["활성 대표 고객을 찾지 못했습니다."],
      primary_lead_id: null,
      lead_table: null,
      lead_name: null,
      lead_created_ymd: null,
      assignment_to_apply: [],
      assignment_to_skip: [],
      memo_to_apply: [],
      memo_to_skip: [],
      unknown_assignees: [],
      last_assignee_name: null,
    };
  }

  if (nameMismatch(row.name, lead.name)) {
    reasons.push(`고객명 불일치(경고만): 엑셀="${row.name}" / DB="${lead.name}"`);
  }
  const leadYmd = isoToYmdKst(lead.created_at);
  if (row.inboundDate && leadYmd && row.inboundDate !== leadYmd) {
    reasons.push(`유입날짜 불일치(경고만): 엑셀=${row.inboundDate} / DB=${leadYmd}`);
  }

  for (const step of row.steps) {
    if (!step.assigneeName.trim()) continue;
    const m = matchStaffByLabel(step.assigneeName, staff);
    if (!m.staff) {
      unknown.push(step.assigneeName.trim());
      if (m.warning) reasons.push(m.warning);
    }
  }

  const assignPlan = planAssignmentLogs({
    leadId: lead.id,
    steps: row.steps,
    resolveAssignee: resolve,
    uploadAt,
  });
  reasons.push(...assignPlan.warnings.filter((w) => !reasons.includes(w)));

  const memoPlan = planMemoBlocks({
    leadId: lead.id,
    steps: row.steps,
    existingMemo: String(lead.memo ?? ""),
  });

  const lastName =
    assignPlan.lastAssigneeId != null
      ? staff.find((s) => s.id === assignPlan.lastAssigneeId)?.name ?? null
      : null;

  const hasFail = false;
  const hasWarn = reasons.length > 0 || unknown.length > 0 || assignPlan.skippedSteps.length > 0;
  return {
    excel_row_number: row.excelRowNumber,
    excel_name: row.name,
    excel_phone: row.phone,
    normalized_phone: row.normalizedPhone,
    excel_inbound_date: row.inboundDate,
    status: hasFail ? "failed" : hasWarn ? "warning" : "ready",
    reasons,
    primary_lead_id: lead.id,
    lead_table: lead.lead_table,
    lead_name: lead.name,
    lead_created_ymd: leadYmd,
    assignment_to_apply: assignPlan.appliedSteps,
    assignment_to_skip: assignPlan.skippedSteps,
    memo_to_apply: memoPlan.applied,
    memo_to_skip: memoPlan.skipped,
    unknown_assignees: Array.from(new Set(unknown)),
    last_assignee_name: lastName,
  };
}

export async function executeExcelImport(opts: {
  buffer: Buffer;
  session: SessionUser;
  fileName?: string;
  confirm: boolean;
}): Promise<{
  job_id: string;
  summary: Record<string, number>;
  rows: Array<Record<string, unknown>>;
}> {
  if (!opts.confirm) throw new Error("confirm 필요");
  const uploadAt = new Date();
  const parsed = parseBeforeDbWorkbook(opts.buffer);
  const staff = await loadStaff();
  const resolve = (name: string) => matchStaffByLabel(name, staff).staff;
  const supabase = getSupabaseAdmin();

  const { data: job, error: jobErr } = await supabase
    .from("lead_excel_import_jobs")
    .insert({
      lead_table: "all",
      mode: "execute",
      status: "running",
      file_name: opts.fileName ?? null,
      uploaded_at: uploadAt.toISOString(),
      executed_by: opts.session.userId,
      executed_by_name: opts.session.name,
      summary: {},
    })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message || "작업 생성 실패");
  const jobId = job.id as string;

  const results: Array<Record<string, unknown>> = [];
  let success = 0;
  let warning = 0;
  let failed = 0;
  let skipped = 0;

  for (const ex of parsed.excludedDuplicates) {
    skipped += 1;
    const rowLog = {
      job_id: jobId,
      excel_row_number: ex.row.excelRowNumber,
      normalized_phone: ex.row.normalizedPhone,
      excel_name: ex.row.name,
      excel_inbound_date: ex.row.inboundDate,
      primary_lead_id: null,
      lead_table: null,
      status: "skipped",
      reasons: [ex.reason],
      assignment_applied: [],
      assignment_skipped: [],
      memo_applied: [],
      memo_skipped: [],
      detail: {},
    };
    await supabase.from("lead_excel_import_row_logs").upsert(rowLog, { onConflict: "job_id,excel_row_number" });
    results.push(flattenResult(rowLog));
  }

  for (const row of parsed.selected) {
    const preview = await previewOneRow(row, staff, resolve, uploadAt);
    if (preview.status === "failed" || !preview.primary_lead_id || !preview.lead_table) {
      failed += 1;
      const rowLog = {
        job_id: jobId,
        excel_row_number: row.excelRowNumber,
        normalized_phone: row.normalizedPhone,
        excel_name: row.name,
        excel_inbound_date: row.inboundDate,
        primary_lead_id: preview.primary_lead_id,
        lead_table: preview.lead_table,
        status: "failed",
        reasons: preview.reasons,
        assignment_applied: [],
        assignment_skipped: preview.assignment_to_skip.map((s) => s.step),
        memo_applied: [],
        memo_skipped: preview.memo_to_skip.map((s) => s.step),
        detail: { preview },
      };
      await supabase.from("lead_excel_import_row_logs").upsert(rowLog, { onConflict: "job_id,excel_row_number" });
      results.push(flattenResult(rowLog));
      continue;
    }

    try {
      const { data: existingKeys } = await supabase
        .from("lead_excel_import_transfers")
        .select("transfer_key")
        .eq("lead_table", preview.lead_table)
        .eq("lead_id", preview.primary_lead_id);
      const keySet = new Set((existingKeys ?? []).map((k) => k.transfer_key as string));

      const { data: leadRow } = await supabase
        .from(preview.lead_table)
        .select("memo, assignee_id")
        .eq("id", preview.primary_lead_id)
        .maybeSingle();

      const assignPlan = planAssignmentLogs({
        leadId: preview.primary_lead_id,
        steps: row.steps,
        resolveAssignee: resolve,
        uploadAt,
        existingTransferKeys: keySet,
      });
      const memoPlan = planMemoBlocks({
        leadId: preview.primary_lead_id,
        steps: row.steps,
        existingMemo: String((leadRow as { memo?: string } | null)?.memo ?? ""),
        existingTransferKeys: keySet,
      });

      const { data: rpcData, error: rpcErr } = await supabase.rpc("apply_excel_assignee_memo_import", {
        p_job_id: jobId,
        p_lead_table: preview.lead_table,
        p_lead_id: preview.primary_lead_id,
        p_assignee_id: assignPlan.lastAssigneeId,
        p_assigned_at: assignPlan.lastAssigneeAt,
        p_merged_memo: memoPlan.nextMemo,
        p_assignments: assignPlan.plans.map((p) => ({
          transfer_key: p.transferKey,
          step: p.step,
          from_assignee_id: p.fromAssigneeId,
          to_assignee_id: p.toAssigneeId,
          assigned_at: p.assignedAtIso,
          reason: p.reason,
        })),
        p_memo_transfers: memoPlan.blocks.map((b) => ({
          transfer_key: b.transferKey,
          step: b.step,
          memo: b.memo,
        })),
      });

      if (rpcErr) throw new Error(rpcErr.message);

      const status = preview.reasons.length || assignPlan.warnings.length ? "warning" : "success";
      if (status === "success") success += 1;
      else warning += 1;

      const rowLog = {
        job_id: jobId,
        excel_row_number: row.excelRowNumber,
        normalized_phone: row.normalizedPhone,
        excel_name: row.name,
        excel_inbound_date: row.inboundDate,
        primary_lead_id: preview.primary_lead_id,
        lead_table: preview.lead_table,
        status,
        reasons: [...preview.reasons, ...assignPlan.skippedSteps.map((s) => `${s.step}차: ${s.reason}`)],
        assignment_applied: assignPlan.appliedSteps,
        assignment_skipped: assignPlan.skippedSteps.map((s) => s.step),
        memo_applied: memoPlan.applied,
        memo_skipped: memoPlan.skipped.map((s) => s.step),
        detail: { rpc: rpcData, last_assignee_id: assignPlan.lastAssigneeId },
      };
      await supabase.from("lead_excel_import_row_logs").upsert(rowLog, { onConflict: "job_id,excel_row_number" });
      results.push(flattenResult(rowLog));
    } catch (e) {
      failed += 1;
      const message = e instanceof Error ? e.message : String(e);
      const rowLog = {
        job_id: jobId,
        excel_row_number: row.excelRowNumber,
        normalized_phone: row.normalizedPhone,
        excel_name: row.name,
        excel_inbound_date: row.inboundDate,
        primary_lead_id: preview.primary_lead_id,
        lead_table: preview.lead_table,
        status: "failed",
        reasons: [message, ...preview.reasons],
        assignment_applied: [],
        assignment_skipped: [],
        memo_applied: [],
        memo_skipped: [],
        detail: {},
      };
      await supabase.from("lead_excel_import_row_logs").upsert(rowLog, { onConflict: "job_id,excel_row_number" });
      results.push(flattenResult(rowLog));
    }
  }

  const summary = {
    success,
    warning,
    failed,
    skipped,
    total: results.length,
  };
  await supabase
    .from("lead_excel_import_jobs")
    .update({
      status: failed && success + warning === 0 ? "failed" : failed ? "partial" : "completed",
      finished_at: new Date().toISOString(),
      summary,
    })
    .eq("id", jobId);

  return { job_id: jobId, summary, rows: results };
}

function flattenResult(rowLog: Record<string, unknown>) {
  return {
    엑셀행: rowLog.excel_row_number,
    고객명: rowLog.excel_name,
    연락처: rowLog.normalized_phone,
    유입일: rowLog.excel_inbound_date,
    대표고객ID: rowLog.primary_lead_id,
    테이블: rowLog.lead_table,
    상태: rowLog.status,
    사유: Array.isArray(rowLog.reasons) ? (rowLog.reasons as string[]).join(" | ") : "",
    담당이력적용차수: Array.isArray(rowLog.assignment_applied)
      ? (rowLog.assignment_applied as number[]).join(",")
      : "",
    담당이력건너뜀: Array.isArray(rowLog.assignment_skipped)
      ? (rowLog.assignment_skipped as number[]).join(",")
      : "",
    메모적용차수: Array.isArray(rowLog.memo_applied) ? (rowLog.memo_applied as number[]).join(",") : "",
    메모건너뜀: Array.isArray(rowLog.memo_skipped) ? (rowLog.memo_skipped as number[]).join(",") : "",
  };
}
