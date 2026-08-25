import { normalizePhoneDigits } from "@/lib/phoneBlacklist";

/** 한국 휴대폰으로 쓰일 수 있는 정규화 번호인지 */
export function isValidNormalizedPhone(digits: string): boolean {
  if (!digits) return false;
  if (digits.length < 10 || digits.length > 11) return false;
  // 01X… 형태만 유효. 대표번호(15xx/16xx/18xx) 등은 검토 대상
  if (!/^01[016789]\d{7,8}$/.test(digits)) return false;
  return true;
}

export function normalizeLeadPhone(phone: string | null | undefined): string {
  return normalizePhoneDigits(phone ?? "");
}

export function normalizeLeadName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

export type MergeLeadCandidate = {
  id: string;
  name: string;
  phone: string;
  normalized_phone?: string | null;
  created_at: string;
  /** 별도 유입일시가 없으면 created_at 사용 */
  received_at?: string | null;
  memo?: string | null;
  assignee_id?: string | null;
  assigned_at?: string | null;
  merge_status?: string | null;
  status?: string | null;
  meeting_at?: string | null;
  source?: string | null;
  entry_page?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
};

export function leadReceivedAt(lead: MergeLeadCandidate): string {
  return lead.received_at || lead.created_at;
}

/**
 * 대표 고객 선정:
 * 1) 유입일시 최신 2) 생성일시 최신 3) PK(UUID 문자열) 최대
 */
export function selectPrimaryLead(leads: MergeLeadCandidate[]): {
  primary: MergeLeadCandidate;
  reason: string;
} {
  if (!leads.length) throw new Error("empty leads");
  const sorted = [...leads].sort((a, b) => {
    const ra = leadReceivedAt(a);
    const rb = leadReceivedAt(b);
    if (ra !== rb) return rb.localeCompare(ra);
    if (a.created_at !== b.created_at) return b.created_at.localeCompare(a.created_at);
    return b.id.localeCompare(a.id);
  });
  const primary = sorted[0];
  const reasons: string[] = [];
  const recv = leadReceivedAt(primary);
  const sameRecv = leads.filter((l) => leadReceivedAt(l) === recv);
  if (sameRecv.length === 1) {
    reasons.push(`유입일시(created_at) 최신: ${recv}`);
  } else {
    const sameCreated = sameRecv.filter((l) => l.created_at === primary.created_at);
    if (sameCreated.length === 1) {
      reasons.push(`유입일시 동일(${recv}) → 생성일시 최신: ${primary.created_at}`);
    } else {
      reasons.push(
        `유입·생성일시 동일 → PK 최대: ${primary.id}`
      );
    }
  }
  return { primary, reason: reasons.join("; ") };
}

export type SkipReason =
  | "empty_phone"
  | "invalid_phone"
  | "name_mismatch"
  | "already_merged"
  | "single_record"
  | "non_mobile_shared_risk";

export function classifyDuplicateGroup(leads: MergeLeadCandidate[]): {
  autoMerge: boolean;
  skipReasons: SkipReason[];
  distinctNames: string[];
  normalizedPhone: string;
} {
  const phones = leads.map((l) => l.normalized_phone || normalizeLeadPhone(l.phone));
  const normalizedPhone = phones.find(Boolean) || "";
  const skipReasons: SkipReason[] = [];
  const active = leads.filter((l) => (l.merge_status ?? "active") !== "merged");

  if (active.length < 2) skipReasons.push("single_record");
  if (!normalizedPhone) skipReasons.push("empty_phone");
  else if (!isValidNormalizedPhone(normalizedPhone)) {
    skipReasons.push("invalid_phone");
    if (normalizedPhone.length >= 10 && !/^01/.test(normalizedPhone)) {
      skipReasons.push("non_mobile_shared_risk");
    }
  }

  const names = Array.from(
    new Set(active.map((l) => normalizeLeadName(l.name)).filter(Boolean))
  );
  if (names.length > 1) skipReasons.push("name_mismatch");

  if (active.some((l) => l.merge_status === "merged")) {
    // mixed active+merged handled by filtering active; ignore
  }

  const autoMerge = skipReasons.length === 0;
  return {
    autoMerge,
    skipReasons: Array.from(new Set(skipReasons)),
    distinctNames: names,
    normalizedPhone,
  };
}

/** 메모 블록이 이미 포함되어 있는지 (유입일 + 본문, 레거시 ID 형식도 인식) */
export function memoAlreadyMerged(
  existingMemo: string,
  sourceId: string,
  sourceMemo: string,
  receivedAt?: string
): boolean {
  const body = sourceMemo.trim() || "(메모 없음)";
  if (receivedAt) {
    const block = formatMergedMemoBlock({ sourceId, receivedAt, memo: sourceMemo });
    if (existingMemo.includes(block)) return true;
  }
  // 레거시: 원본 고객 ID 포함 형식
  const legacyMarker = `[중복 고객 병합 · 원본 고객 ID: ${sourceId}`;
  if (existingMemo.includes(legacyMarker)) {
    if (!sourceMemo.trim()) return true;
    return existingMemo.includes(sourceMemo.trim());
  }
  return false;
}

/** 유입일시를 KST YYYY-MM-DD로 */
export function receivedAtToYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : String(iso).slice(0, 10);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatMergedMemoBlock(opts: {
  sourceId: string;
  receivedAt: string;
  memo: string;
}): string {
  const body = opts.memo.trim() || "(메모 없음)";
  const ymd = receivedAtToYmd(opts.receivedAt);
  return `[중복 고객 병합 · 유입일: ${ymd}]\n${body}`;
}

export function mergeMemos(primary: MergeLeadCandidate, sources: MergeLeadCandidate[]): string {
  let memo = String(primary.memo ?? "").trim();
  const ordered = [...sources].sort((a, b) => leadReceivedAt(a).localeCompare(leadReceivedAt(b)));
  for (const src of ordered) {
    const srcMemo = String(src.memo ?? "");
    const receivedAt = leadReceivedAt(src);
    if (memoAlreadyMerged(memo, src.id, srcMemo, receivedAt)) continue;
    const block = formatMergedMemoBlock({
      sourceId: src.id,
      receivedAt,
      memo: srcMemo,
    });
    memo = memo ? `${memo}\n\n${block}` : block;
  }
  return memo;
}

export type AssignmentLogLike = {
  id?: string;
  from_assignee_id?: string | null;
  to_assignee_id?: string | null;
  assigned_at: string;
  lead_id?: string;
};

/** 변경일시 오름차순 + 동일 원본 기록 키로 중복 제거 */
export function mergeAssignmentLogs(
  logs: AssignmentLogLike[]
): AssignmentLogLike[] {
  const key = (l: AssignmentLogLike) =>
    `${l.from_assignee_id ?? ""}|${l.to_assignee_id ?? ""}|${l.assigned_at}`;
  const seen = new Set<string>();
  const out: AssignmentLogLike[] = [];
  const sorted = [...logs].sort((a, b) => a.assigned_at.localeCompare(b.assigned_at));
  for (const log of sorted) {
    const k = key(log);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(log);
  }
  return out;
}

/** 통합 이력 중 가장 최근 유효 to_assignee */
export function latestAssigneeFromLogs(
  logs: AssignmentLogLike[]
): { assigneeId: string | null; assignedAt: string | null } {
  const merged = mergeAssignmentLogs(logs);
  for (let i = merged.length - 1; i >= 0; i--) {
    const to = merged[i].to_assignee_id;
    if (to) return { assigneeId: to, assignedAt: merged[i].assigned_at };
  }
  return { assigneeId: null, assignedAt: null };
}
