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
import { normalizeLeadPhone } from "@/lib/crm/merge/logic";
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
  normalized_phone?: string | null;
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

const PHONE_CHUNK = 80;
const ID_CHUNK = 80;
const LEAD_SELECT =
  "id, name, phone, created_at, memo, assignee_id, merge_status, merged_into_id, normalized_phone";

async function loadStaff(): Promise<StaffMatch[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("staff_users").select("id, name").eq("is_active", true);
  return (data ?? []) as StaffMatch[];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function phoneKeyOf(row: { phone?: string | null; normalized_phone?: string | null }): string {
  return String(row.normalized_phone || normalizeLeadPhone(row.phone) || "").trim();
}

async function fetchTableByPhones(table: LeadTable, phones: string[]): Promise<MatchedLead[]> {
  if (!phones.length) return [];
  const supabase = getSupabaseAdmin();
  const hits: MatchedLead[] = [];
  const chunks = chunkArray(phones, PHONE_CHUNK);
  // 청크를 소규모 병렬로 조회 (전체 직렬 대비 대폭 단축)
  for (const batch of chunkArray(chunks, 4)) {
    const results = await Promise.all(
      batch.map(async (chunk) => {
        const { data, error } = await supabase.from(table).select(LEAD_SELECT).in("normalized_phone", chunk);
        if (!error) return (data ?? []).map((row) => ({ ...(row as unknown as MatchedLead), lead_table: table }));
        const { data: fb } = await supabase
          .from(table)
          .select("id, name, phone, created_at, memo, assignee_id, merge_status, merged_into_id")
          .in("phone", chunk);
        return (fb ?? []).map((row) => ({
          ...(row as MatchedLead),
          lead_table: table,
          normalized_phone: phoneKeyOf(row),
        }));
      })
    );
    for (const part of results) hits.push(...part);
  }
  return hits;
}

async function fetchByIds(table: LeadTable, ids: string[]): Promise<MatchedLead[]> {
  if (!ids.length) return [];
  const supabase = getSupabaseAdmin();
  const hits: MatchedLead[] = [];
  for (const chunk of chunkArray(ids, ID_CHUNK)) {
    const { data } = await supabase.from(table).select(LEAD_SELECT).in("id", chunk);
    for (const row of data ?? []) {
      hits.push({ ...(row as unknown as MatchedLead), lead_table: table });
    }
  }
  return hits;
}

/** 병합 체인을 배치로 펼쳐 id→대표 후보 맵을 채운다 */
async function hydrateMergeTargets(byId: Map<string, MatchedLead>): Promise<void> {
  for (let guard = 0; guard < 20; guard += 1) {
    const missing = new Set<string>();
    for (const lead of Array.from(byId.values())) {
      if (lead.merge_status === "merged" && lead.merged_into_id && !byId.has(lead.merged_into_id)) {
        missing.add(lead.merged_into_id);
      }
    }
    if (!missing.size) return;
    const ids = Array.from(missing);
    const [a, b] = await Promise.all([fetchByIds("leads", ids), fetchByIds("tylife_b2b", ids)]);
    for (const row of [...a, ...b]) byId.set(row.id, row);
    if (![...a, ...b].length) return;
  }
}

function followMerge(hit: MatchedLead, byId: Map<string, MatchedLead>, warnings: string[]): MatchedLead {
  let cur = hit;
  const seen = new Set<string>();
  while (cur.merge_status === "merged" && cur.merged_into_id) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const next = byId.get(cur.merged_into_id);
    if (!next) {
      warnings.push(`병합 대상(merged_into_id)을 찾지 못함: ${cur.merged_into_id}`);
      break;
    }
    cur = next;
  }
  return cur;
}

function pickPrimaryFromHits(
  hits: MatchedLead[],
  byId: Map<string, MatchedLead>
): { lead: MatchedLead | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!hits.length) return { lead: null, warnings };
  const resolved = hits.map((h) => followMerge(h, byId, warnings));
  const active = resolved.filter((r) => (r.merge_status ?? "active") !== "merged");
  const pool = active.length ? active : resolved;
  const uniq = Array.from(new Map(pool.map((r) => [r.id, r])).values());
  if (uniq.length > 1) {
    warnings.push(
      `동일 번호 활성 고객 ${uniq.length}건 → 최신 유입(created_at) 1건 사용 (${uniq.map((u) => u.id.slice(0, 8)).join(", ")})`
    );
    uniq.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  return { lead: uniq[0] ?? null, warnings };
}

/** 엑셀 전화번호를 한 번에 조회해 phone → hits 인덱스 구성 */
async function buildPhoneLeadIndex(phones: string[]): Promise<{
  byPhone: Map<string, MatchedLead[]>;
  byId: Map<string, MatchedLead>;
}> {
  const unique = Array.from(new Set(phones.map((p) => p.trim()).filter(Boolean)));
  const [leadsHits, b2bHits] = await Promise.all([
    fetchTableByPhones("leads", unique),
    fetchTableByPhones("tylife_b2b", unique),
  ]);
  const byId = new Map<string, MatchedLead>();
  for (const row of [...leadsHits, ...b2bHits]) byId.set(row.id, row);
  await hydrateMergeTargets(byId);

  const byPhone = new Map<string, MatchedLead[]>();
  for (const phone of unique) byPhone.set(phone, []);
  for (const row of [...leadsHits, ...b2bHits]) {
    const key = phoneKeyOf(row);
    if (!key) continue;
    const list = byPhone.get(key) ?? [];
    list.push(row);
    byPhone.set(key, list);
  }
  return { byPhone, byId };
}

function resolvePrimaryFromIndex(
  phone: string,
  index: { byPhone: Map<string, MatchedLead[]>; byId: Map<string, MatchedLead> }
): { lead: MatchedLead | null; warnings: string[] } {
  const hits = index.byPhone.get(phone) ?? [];
  return pickPrimaryFromHits(hits, index.byId);
}

async function loadTransferKeysForLeads(
  pairs: Array<{ lead_table: LeadTable; lead_id: string }>
): Promise<Map<string, Set<string>>> {
  const supabase = getSupabaseAdmin();
  const out = new Map<string, Set<string>>();
  const uniq = Array.from(new Map(pairs.map((p) => [`${p.lead_table}:${p.lead_id}`, p])).values());
  for (const chunk of chunkArray(uniq, ID_CHUNK)) {
    const ids = chunk.map((c) => c.lead_id);
    const { data } = await supabase
      .from("lead_excel_import_transfers")
      .select("lead_table, lead_id, transfer_key")
      .in("lead_id", ids);
    for (const row of data ?? []) {
      const key = `${row.lead_table}:${row.lead_id}`;
      const set = out.get(key) ?? new Set<string>();
      set.add(String(row.transfer_key));
      out.set(key, set);
    }
  }
  return out;
}

export async function buildExcelImportPreview(buffer: Buffer, opts?: { uploadAt?: Date }) {
  const uploadAt = opts?.uploadAt ?? new Date();
  const parsed = parseBeforeDbWorkbook(buffer);
  const staff = await loadStaff();
  const resolve = (name: string) => matchStaffByLabel(name, staff).staff;

  const index = await buildPhoneLeadIndex(parsed.selected.map((r) => r.normalizedPhone));

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
    const match = resolvePrimaryFromIndex(row.normalizedPhone, index);
    rowPreviews.push(previewOneRow(row, staff, resolve, uploadAt, match));
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

function previewOneRow(
  row: ExcelImportRawRow,
  staff: StaffMatch[],
  resolve: (name: string) => StaffMatch | null,
  uploadAt: Date,
  match: { lead: MatchedLead | null; warnings: string[] }
): RowPreview {
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

  reasons.push(...match.warnings);
  const lead = match.lead;
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

  const hasWarn = reasons.length > 0 || unknown.length > 0 || assignPlan.skippedSteps.length > 0;
  return {
    excel_row_number: row.excelRowNumber,
    excel_name: row.name,
    excel_phone: row.phone,
    normalized_phone: row.normalizedPhone,
    excel_inbound_date: row.inboundDate,
    status: hasWarn ? "warning" : "ready",
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

  const index = await buildPhoneLeadIndex(parsed.selected.map((r) => r.normalizedPhone));

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

  const rowLogs: Record<string, unknown>[] = [];

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
    rowLogs.push(rowLog);
    results.push(flattenResult(rowLog));
  }

  const matchedPairs: Array<{ lead_table: LeadTable; lead_id: string }> = [];
  const previews: Array<{ row: ExcelImportRawRow; preview: RowPreview }> = [];
  for (const row of parsed.selected) {
    const match = resolvePrimaryFromIndex(row.normalizedPhone, index);
    const preview = previewOneRow(row, staff, resolve, uploadAt, match);
    previews.push({ row, preview });
    if (preview.primary_lead_id && preview.lead_table) {
      matchedPairs.push({ lead_table: preview.lead_table, lead_id: preview.primary_lead_id });
    }
  }

  const transferByLead = await loadTransferKeysForLeads(matchedPairs);

  for (const { row, preview } of previews) {
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
      rowLogs.push(rowLog);
      results.push(flattenResult(rowLog));
      continue;
    }

    try {
      const keySet =
        transferByLead.get(`${preview.lead_table}:${preview.primary_lead_id}`) ?? new Set<string>();
      const leadFromIndex = index.byId.get(preview.primary_lead_id);
      const existingMemo = String(leadFromIndex?.memo ?? "");

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
        existingMemo,
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

      // 이후 동일 고객 재등장 시 중복 방지
      for (const p of assignPlan.plans) keySet.add(p.transferKey);
      for (const b of memoPlan.blocks) keySet.add(b.transferKey);
      transferByLead.set(`${preview.lead_table}:${preview.primary_lead_id}`, keySet);
      if (leadFromIndex) leadFromIndex.memo = memoPlan.nextMemo;

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
      rowLogs.push(rowLog);
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
      rowLogs.push(rowLog);
      results.push(flattenResult(rowLog));
    }
  }

  // 행 로그 일괄 저장
  for (const chunk of chunkArray(rowLogs, 50)) {
    const { error: logErr } = await supabase.from("lead_excel_import_row_logs").upsert(chunk, {
      onConflict: "job_id,excel_row_number",
    });
    if (logErr) console.error("excel import row_logs upsert:", logErr);
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
