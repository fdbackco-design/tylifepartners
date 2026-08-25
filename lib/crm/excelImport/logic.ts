import { createHash } from "crypto";
import { normalizeLeadName, normalizeLeadPhone, isValidNormalizedPhone } from "@/lib/crm/merge/logic";

export type ExcelAssigneeStep = {
  step: number; // 1..7
  assigneeName: string;
  memo: string;
};

export type ExcelImportRawRow = {
  excelRowNumber: number; // 1-based sheet row (header=1)
  inboundDate: string | null; // YYYY-MM-DD or null
  inboundDateRaw: unknown;
  name: string;
  phone: string;
  normalizedPhone: string;
  steps: ExcelAssigneeStep[];
};

export type StaffMatch = { id: string; name: string };

/** 직함·등급·숫자 등 접미사 (반복 제거) */
const ASSIGNEE_SUFFIX_RE =
  /(?:대표|팀장|이사|매니저|레벨업|원장|실장|과장|부장|차장|대리|주임|사원|프로|님|\d)+$/;

/** 엑셀·DB 담당자명 정규화: 공백 제거 후 접미사(대표/팀장/레벨업/2 등) 무시 */
export function normalizeAssigneeLabel(raw: string): string {
  let s = String(raw ?? "")
    .trim()
    .replace(/[\s_\-·./]+/g, "");
  // 접미사·끝자리 숫자를 더 이상 안 남을 때까지 제거 (예: 이재원2팀장, 장동욱레벨업)
  for (;;) {
    const next = s.replace(ASSIGNEE_SUFFIX_RE, "");
    if (next === s) break;
    s = next;
  }
  return s;
}

/** 동일 정규화명 후보 중 대표 1명 선택 (접미사만 다른 중복 계정 허용) */
function pickPreferredStaff(labelRaw: string, hits: StaffMatch[]): StaffMatch {
  const raw = labelRaw.trim();
  const norm = normalizeAssigneeLabel(raw);
  const exact = hits.find((s) => s.name.trim() === raw);
  if (exact) return exact;
  const bare = hits.find((s) => s.name.trim().replace(/[\s_\-·./]+/g, "") === norm);
  if (bare) return bare;
  // 접미사가 가장 짧은(기본 이름에 가까운) 계정
  return [...hits].sort((a, b) => {
    const la = a.name.trim().length;
    const lb = b.name.trim().length;
    if (la !== lb) return la - lb;
    return a.id.localeCompare(b.id);
  })[0];
}

export function matchStaffByLabel(
  label: string,
  staff: StaffMatch[]
): { staff: StaffMatch | null; warning?: string } {
  const raw = String(label ?? "").trim();
  if (!raw) return { staff: null };
  const exact = staff.find((s) => s.name.trim() === raw);
  if (exact) return { staff: exact };
  const norm = normalizeAssigneeLabel(raw);
  if (!norm) return { staff: null, warning: `담당자 매칭 실패: ${raw}` };

  const hits = staff.filter((s) => normalizeAssigneeLabel(s.name) === norm);
  if (hits.length === 1) return { staff: hits[0] };
  if (hits.length > 1) {
    return { staff: pickPreferredStaff(raw, hits) };
  }

  // soft: 정규화 후 한쪽이 다른 쪽 접두/포함 (짧은 이름 ≥2자)
  const soft = staff.filter((s) => {
    const sn = normalizeAssigneeLabel(s.name);
    if (!sn || sn.length < 2 || norm.length < 2) return false;
    return norm === sn || norm.startsWith(sn) || sn.startsWith(norm);
  });
  if (soft.length === 1) return { staff: soft[0] };
  if (soft.length > 1) {
    const sameBase = soft.filter((s) => normalizeAssigneeLabel(s.name) === norm);
    if (sameBase.length >= 1) return { staff: pickPreferredStaff(raw, sameBase) };
    return { staff: pickPreferredStaff(raw, soft) };
  }
  return { staff: null, warning: `담당자 매칭 실패: ${raw}` };
}

export function excelDateToYmd(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(value * 86400000);
    const dt = new Date(ms);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const m = s.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

export function isoToYmdKst(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  if (!map.year || !map.month || !map.day) return null;
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * 열 위치 기준 파싱:
 * 0 유입날짜, 1 고객성함, 2 연락처,
 * 3/4 = 1차 담당자/메모 … 15/16 = 7차
 */
export function parseExcelRowByPosition(excelRowNumber: number, cells: unknown[]): ExcelImportRawRow {
  const padded = [...cells];
  while (padded.length < 17) padded.push(null);
  const phoneRaw = String(padded[2] ?? "");
  const normalizedPhone = normalizeLeadPhone(phoneRaw);
  const steps: ExcelAssigneeStep[] = [];
  for (let step = 1; step <= 7; step++) {
    const aIdx = 3 + (step - 1) * 2;
    const mIdx = aIdx + 1;
    steps.push({
      step,
      assigneeName: String(padded[aIdx] ?? "").trim(),
      memo: String(padded[mIdx] ?? "").trim(),
    });
  }
  return {
    excelRowNumber,
    inboundDate: excelDateToYmd(padded[0]),
    inboundDateRaw: padded[0],
    name: String(padded[1] ?? "").trim(),
    phone: phoneRaw.trim(),
    normalizedPhone,
    steps,
  };
}

/** 동일 전화 다중 행 → 유입일 최신, 동일이면 아래쪽 행 */
export function dedupeRowsByPhone(rows: ExcelImportRawRow[]): {
  selected: ExcelImportRawRow[];
  excluded: Array<{ row: ExcelImportRawRow; winnerRowNumber: number; reason: string }>;
} {
  const byPhone = new Map<string, ExcelImportRawRow[]>();
  for (const row of rows) {
    const key = row.normalizedPhone || `__empty__:${row.excelRowNumber}`;
    const list = byPhone.get(key) ?? [];
    list.push(row);
    byPhone.set(key, list);
  }
  const selected: ExcelImportRawRow[] = [];
  const excluded: Array<{ row: ExcelImportRawRow; winnerRowNumber: number; reason: string }> = [];
  for (const [, group] of Array.from(byPhone.entries())) {
    if (group.length === 1) {
      selected.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      const da = a.inboundDate || "";
      const db = b.inboundDate || "";
      if (da !== db) return db.localeCompare(da);
      return b.excelRowNumber - a.excelRowNumber;
    });
    selected.push(sorted[0]);
    for (const row of sorted.slice(1)) {
      excluded.push({
        row,
        winnerRowNumber: sorted[0].excelRowNumber,
        reason: `동일 전화번호 중복 → ${sorted[0].excelRowNumber}행 사용 (유입일 ${sorted[0].inboundDate || "없음"})`,
      });
    }
  }
  selected.sort((a, b) => a.excelRowNumber - b.excelRowNumber);
  return { selected, excluded };
}

export function transferKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

export function formatStepMemoBlock(step: number, memo: string): string {
  return `${step}차 담당자\n${memo.trim()}`;
}

export function memoAlreadyHasStepBlock(existingMemo: string, step: number, memo: string): boolean {
  const block = formatStepMemoBlock(step, memo);
  return existingMemo.includes(block);
}

export function appendStepMemos(existingMemo: string, blocks: Array<{ step: number; memo: string }>): {
  nextMemo: string;
  applied: number[];
  skipped: number[];
} {
  let next = String(existingMemo ?? "").trim();
  const applied: number[] = [];
  const skipped: number[] = [];
  for (const b of blocks) {
    const body = b.memo.trim();
    if (!body) {
      skipped.push(b.step);
      continue;
    }
    if (memoAlreadyHasStepBlock(next, b.step, body)) {
      skipped.push(b.step);
      continue;
    }
    const block = formatStepMemoBlock(b.step, body);
    next = next ? `${next}\n\n${block}` : block;
    applied.push(b.step);
  }
  return { nextMemo: next, applied, skipped };
}

export type PlannedAssignment = {
  step: number;
  fromAssigneeId: string | null;
  toAssigneeId: string;
  toAssigneeName: string;
  assignedAtIso: string;
  reason: string;
  transferKey: string;
  skipped?: boolean;
  skipReason?: string;
};

/**
 * 메모가 있는 차수만 담당자 이력 후보.
 * 빈 담당자 제외, 연속 동일 담당자 중복 제외.
 * assigned_at = uploadAt + step초 (순서 보존, 유입일 위조 없음)
 */
export function planAssignmentLogs(opts: {
  leadId: string;
  steps: ExcelAssigneeStep[];
  resolveAssignee: (name: string) => { id: string; name: string } | null;
  uploadAt: Date;
  existingTransferKeys?: Set<string>;
}): {
  plans: PlannedAssignment[];
  appliedSteps: number[];
  skippedSteps: Array<{ step: number; reason: string }>;
  warnings: string[];
  lastAssigneeId: string | null;
  lastAssigneeAt: string | null;
} {
  const warnings: string[] = [];
  const skippedSteps: Array<{ step: number; reason: string }> = [];
  const plans: PlannedAssignment[] = [];
  const appliedSteps: number[] = [];
  let prevTo: string | null = null;
  let lastAssigneeId: string | null = null;
  let lastAssigneeAt: string | null = null;

  for (const step of opts.steps) {
    const memo = step.memo.trim();
    const name = step.assigneeName.trim();
    if (!memo) {
      // 메모 없는 차수는 이력 대상 아님. 다만 유효 담당자면 현재 담당자 후보로는 갱신
      if (name) {
        const hit = opts.resolveAssignee(name);
        if (!hit) warnings.push(`담당자 매칭 실패: ${name} (${step.step}차)`);
        else {
          lastAssigneeId = hit.id;
          lastAssigneeAt = new Date(opts.uploadAt.getTime() + step.step * 1000).toISOString();
        }
      }
      continue;
    }
    if (!name) {
      skippedSteps.push({ step: step.step, reason: "메모만 있고 담당자 없음 → 이력 생략" });
      continue;
    }
    const hit = opts.resolveAssignee(name);
    if (!hit) {
      warnings.push(`담당자 매칭 실패: ${name} (${step.step}차)`);
      skippedSteps.push({ step: step.step, reason: `존재하지 않는 담당자: ${name}` });
      continue;
    }
    lastAssigneeId = hit.id;
    const assignedAtIso = new Date(opts.uploadAt.getTime() + step.step * 1000).toISOString();
    lastAssigneeAt = assignedAtIso;
    if (prevTo === hit.id) {
      skippedSteps.push({ step: step.step, reason: "연속 동일 담당자 → 이력 생략" });
      continue;
    }
    const key = transferKey([opts.leadId, "assignment", String(step.step), hit.id, memo]);
    if (opts.existingTransferKeys?.has(key)) {
      skippedSteps.push({ step: step.step, reason: "이미 이관된 담당자 이력" });
      prevTo = hit.id;
      continue;
    }
    plans.push({
      step: step.step,
      fromAssigneeId: prevTo,
      toAssigneeId: hit.id,
      toAssigneeName: hit.name,
      assignedAtIso,
      reason: `excel_import:step:${step.step}`,
      transferKey: key,
    });
    appliedSteps.push(step.step);
    prevTo = hit.id;
  }

  return { plans, appliedSteps, skippedSteps, warnings, lastAssigneeId, lastAssigneeAt };
}

export function planMemoBlocks(opts: {
  leadId: string;
  steps: ExcelAssigneeStep[];
  existingMemo: string;
  existingTransferKeys?: Set<string>;
}): {
  blocks: Array<{ step: number; memo: string; transferKey: string }>;
  applied: number[];
  skipped: Array<{ step: number; reason: string }>;
  nextMemo: string;
} {
  const blocks: Array<{ step: number; memo: string; transferKey: string }> = [];
  const skipped: Array<{ step: number; reason: string }> = [];
  const toAppend: Array<{ step: number; memo: string }> = [];

  for (const step of opts.steps) {
    const memo = step.memo.trim();
    if (!memo) continue;
    const key = transferKey([opts.leadId, "memo", String(step.step), memo]);
    if (opts.existingTransferKeys?.has(key) || memoAlreadyHasStepBlock(opts.existingMemo, step.step, memo)) {
      skipped.push({ step: step.step, reason: "동일 차수·내용 메모 이미 존재" });
      continue;
    }
    blocks.push({ step: step.step, memo, transferKey: key });
    toAppend.push({ step: step.step, memo });
  }
  const { nextMemo, applied } = appendStepMemos(opts.existingMemo, toAppend);
  return { blocks, applied, skipped, nextMemo };
}

export function nameMismatch(excelName: string, leadName: string): boolean {
  const a = normalizeLeadName(excelName);
  const b = normalizeLeadName(leadName);
  return Boolean(a && b && a !== b);
}

export { normalizeLeadPhone, isValidNormalizedPhone, normalizeLeadName };
