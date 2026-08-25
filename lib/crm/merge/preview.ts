import {
  classifyDuplicateGroup,
  leadReceivedAt,
  latestAssigneeFromLogs,
  mergeAssignmentLogs,
  mergeMemos,
  normalizeLeadPhone,
  selectPrimaryLead,
  type MergeLeadCandidate,
  type SkipReason,
} from "@/lib/crm/merge/logic";
import { getSupabaseAdmin } from "@/lib/supabase";

export type LeadTable = "leads" | "tylife_b2b";

const LEAD_SELECT =
  "id, name, phone, normalized_phone, created_at, memo, assignee_id, assigned_at, merge_status, status, meeting_at, source, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term";

export type RelatedCounts = {
  assignment_logs: number;
  memo_logs: number;
  status_logs: number;
  crm_sync_status: number;
  inbound_fields: number;
};

export type DuplicateGroupPreview = {
  lead_table: LeadTable;
  normalized_phone: string;
  auto_merge: boolean;
  skip_reasons: SkipReason[];
  distinct_names: string[];
  primary: MergeLeadCandidate;
  primary_selection_reason: string;
  sources: MergeLeadCandidate[];
  members: MergeLeadCandidate[];
  related: RelatedCounts;
  conflicts: string[];
  memo_blocks_to_add: number;
  assignment_logs_to_move: number;
};

export type MergePreviewResult = {
  lead_table: LeadTable;
  group_count: number;
  mergeable_group_count: number;
  review_group_count: number;
  mergeable_lead_count: number;
  review_lead_count: number;
  groups: DuplicateGroupPreview[];
  schema_notes: string[];
};

async function loadActiveLeads(table: LeadTable): Promise<MergeLeadCandidate[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(table)
    .select(LEAD_SELECT)
    .or("merge_status.eq.active,merge_status.is.null")
    .order("created_at", { ascending: false })
    .limit(20000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: MergeLeadCandidate) => ({
    ...row,
    normalized_phone: row.normalized_phone || normalizeLeadPhone(row.phone),
  }));
}

async function countRelated(table: LeadTable, leadIds: string[]): Promise<RelatedCounts> {
  const supabase = getSupabaseAdmin();
  const empty: RelatedCounts = {
    assignment_logs: 0,
    memo_logs: 0,
    status_logs: 0,
    crm_sync_status: 0,
    inbound_fields: 0,
  };
  if (!leadIds.length) return empty;

  const [a, m, s, c] = await Promise.all([
    supabase
      .from("lead_assignment_logs")
      .select("id", { count: "exact", head: true })
      .eq("lead_table", table)
      .in("lead_id", leadIds),
    supabase
      .from("lead_memo_logs")
      .select("id", { count: "exact", head: true })
      .eq("lead_table", table)
      .in("lead_id", leadIds),
    supabase
      .from("lead_status_logs")
      .select("id", { count: "exact", head: true })
      .eq("lead_table", table)
      .in("lead_id", leadIds),
    supabase.from("crm_sync_status").select("submission_id", { count: "exact", head: true }).in("submission_id", leadIds),
  ]);

  return {
    assignment_logs: a.count ?? 0,
    memo_logs: m.count ?? 0,
    status_logs: s.count ?? 0,
    crm_sync_status: c.count ?? 0,
    inbound_fields: leadIds.length,
  };
}

function groupByPhone(leads: MergeLeadCandidate[]): Map<string, MergeLeadCandidate[]> {
  const map = new Map<string, MergeLeadCandidate[]>();
  for (const lead of leads) {
    const phone = lead.normalized_phone || normalizeLeadPhone(lead.phone);
    if (!phone) {
      const key = `__empty__:${lead.id}`;
      map.set(key, [lead]);
      continue;
    }
    const list = map.get(phone) ?? [];
    list.push(lead);
    map.set(phone, list);
  }
  return map;
}

export async function buildMergePreview(table: LeadTable): Promise<MergePreviewResult> {
  const leads = await loadActiveLeads(table);
  const byPhone = groupByPhone(leads);
  const groups: DuplicateGroupPreview[] = [];

  for (const [phoneKey, members] of Array.from(byPhone.entries())) {
    if (members.length < 2 && !phoneKey.startsWith("__empty__")) continue;
    if (members.length < 2) continue;

    const classified = classifyDuplicateGroup(members);
    const { primary, reason } = selectPrimaryLead(members);
    const sources = members.filter((m: MergeLeadCandidate) => m.id !== primary.id);
    const related = await countRelated(
      table,
      members.map((m: MergeLeadCandidate) => m.id)
    );

    const supabase = getSupabaseAdmin();
    const { data: assignLogs } = await supabase
      .from("lead_assignment_logs")
      .select("id, from_assignee_id, to_assignee_id, assigned_at, lead_id")
      .eq("lead_table", table)
      .in(
        "lead_id",
        members.map((m: MergeLeadCandidate) => m.id)
      );

    const mergedLogs = mergeAssignmentLogs(assignLogs ?? []);
    const memoPreview = mergeMemos(primary, sources);
    const primaryMemo = String(primary.memo ?? "").trim();
    const memoBlocks =
      memoPreview === primaryMemo
        ? 0
        : Math.max(
            memoPreview.split("[중복 고객 병합 · 유입일:").length - 1,
            memoPreview.split("[중복 고객 병합 · 원본 고객 ID:").length - 1
          );

    const conflicts: string[] = [];
    if (classified.skipReasons.includes("name_mismatch")) {
      conflicts.push("동일 번호·다른 고객명 → 자동 병합 제외 (관리자 확인)");
    }
    if (members.filter((m: MergeLeadCandidate) => m.meeting_at).length > 1) {
      const times = new Set(members.map((m: MergeLeadCandidate) => m.meeting_at).filter(Boolean));
      if (times.size > 1) conflicts.push("대면 일정(meeting_at)이 서로 다름 → 대표(최신 유입) 일정 유지");
    }
    // 계약/결제 테이블 없음 — 스키마 노트에서 안내

    groups.push({
      lead_table: table,
      normalized_phone: classified.normalizedPhone || phoneKey,
      auto_merge: classified.autoMerge,
      skip_reasons: classified.skipReasons,
      distinct_names: classified.distinctNames,
      primary,
      primary_selection_reason: reason,
      sources,
      members,
      related,
      conflicts,
      memo_blocks_to_add: Math.max(0, memoBlocks),
      assignment_logs_to_move: mergedLogs.length,
    });
  }

  groups.sort((a, b) => b.members.length - a.members.length || a.normalized_phone.localeCompare(b.normalized_phone));

  const mergeable = groups.filter((g) => g.auto_merge);
  const review = groups.filter((g) => !g.auto_merge);

  return {
    lead_table: table,
    group_count: groups.length,
    mergeable_group_count: mergeable.length,
    review_group_count: review.length,
    mergeable_lead_count: mergeable.reduce((n, g) => n + g.sources.length, 0),
    review_lead_count: review.reduce((n, g) => n + g.members.length, 0),
    groups,
    schema_notes: [
      "유입일시는 별도 컬럼이 없어 created_at을 사용합니다.",
      "UTM/광고 필드는 리드 행에 단일 세트만 있어 lead_inbound_logs로 보존합니다(마이그레이션 022).",
      "계약·결제·통화·문자·첨부·태그 테이블은 스키마에 없습니다.",
      "대면 일정은 meeting_at 컬럼만 존재하며 대표 고객 값을 유지합니다.",
      "crm_sync_status는 submission_id=리드 ID로 유지되며 병합 시 삭제하지 않습니다.",
      "전화번호 UNIQUE 제약은 적용하지 않습니다(공용번호 가능).",
    ],
  };
}

export function inboundPayloadForGroup(
  primary: MergeLeadCandidate,
  sources: MergeLeadCandidate[]
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const lead of [primary, ...sources]) {
    rows.push({
      source_lead_id: lead.id,
      received_at: leadReceivedAt(lead),
      name: lead.name,
      phone: lead.phone,
      normalized_phone: lead.normalized_phone || normalizeLeadPhone(lead.phone),
      source: lead.source ?? null,
      entry_page: lead.entry_page ?? null,
      utm_source: lead.utm_source ?? null,
      utm_medium: lead.utm_medium ?? null,
      utm_campaign: lead.utm_campaign ?? null,
      utm_content: lead.utm_content ?? null,
      utm_term: lead.utm_term ?? null,
    });
  }
  return rows;
}

export async function resolveAssigneeForMerge(
  table: LeadTable,
  primary: MergeLeadCandidate,
  memberIds: string[]
): Promise<{ assigneeId: string | null; assignedAt: string | null }> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("lead_assignment_logs")
    .select("from_assignee_id, to_assignee_id, assigned_at, lead_id")
    .eq("lead_table", table)
    .in("lead_id", memberIds)
    .order("assigned_at", { ascending: true });

  const fromLogs = latestAssigneeFromLogs(data ?? []);
  if (fromLogs.assigneeId) return fromLogs;
  return {
    assigneeId: primary.assignee_id ?? null,
    assignedAt: primary.assigned_at ?? null,
  };
}
