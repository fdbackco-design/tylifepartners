import { addDaysYmd, calendarDaysElapsed, kstYmd, parseKstYmd } from "@/lib/crm/kst";
import { visibleAssigneeIds } from "@/lib/crm/scope";
import { TM001_PARTNER_CODE } from "@/lib/crm/tm001/types";
import type { SessionUser } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export type CrmCheckupItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export type CrmCheckupResult = {
  items: CrmCheckupItem[];
  total: number;
};

/** 상태 변경 자동기록·시스템 태그만 있고, 실제 상담 내용이 없는지 */
const AUTO_STATUS_LINE =
  /^(?:\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\]\s*(?:배정전|대기|1차컨택|부재\(메신저완료\)|상담완료|통화약속|대면확정|가입완료|미접촉|부재|유효통화|관심|재콜|거절|수신거부|번호오류|계약완료)|\[중복\][^\n]*|\[동일연락처\][^\n]*)\s*$/gm;

export function isMemoEssentiallyEmpty(memo: string | null | undefined): boolean {
  const withoutAuto = String(memo ?? "")
    .replace(AUTO_STATUS_LINE, "")
    .trim();
  return withoutAuto.length < 2;
}

function hasTm001Comments(comments: unknown): boolean {
  if (!Array.isArray(comments)) return false;
  return comments.some((c) => {
    if (!c || typeof c !== "object") return false;
    return String((c as { text?: unknown }).text ?? "").trim().length > 0;
  });
}

/** 점검 대상 담당자 스코프 — 영업자 본인/산하. 관리자는 본인만(전역 알림 과다 방지) */
export async function checkupAssigneeScope(session: SessionUser): Promise<string[] | null> {
  if (session.rank === "admin") {
    return session.userId ? [session.userId] : null;
  }
  const scoped = await visibleAssigneeIds(session);
  if (scoped === "all") return session.userId ? [session.userId] : null;
  if (!scoped.length) return null;
  return scoped;
}

function pushItem(items: CrmCheckupItem[], item: Omit<CrmCheckupItem, "count"> & { count: number }) {
  if (item.count <= 0) return;
  items.push(item);
}

function leadListHref(base: "/admin/consumers" | "/admin/candidates", ids: string[]) {
  const sp = new URLSearchParams();
  sp.set("ids", ids.slice(0, 200).join(","));
  return `${base}?${sp.toString()}`;
}

function tmListHref(ids: string[], statusHint?: string) {
  const sp = new URLSearchParams();
  sp.set("ids", ids.slice(0, 200).join(","));
  if (statusHint) sp.set("status", statusHint);
  return `/admin/tm001?${sp.toString()}`;
}

/**
 * 담당 고객 중 메모·일정·상태 후속이 비어 있는 건을 집계합니다.
 * 통제용이 아니라 콜 중 놓친 후속을 짚어 주는 용도입니다.
 */
export async function buildCrmCheckup(session: SessionUser): Promise<CrmCheckupResult> {
  const assigneeIds = await checkupAssigneeScope(session);
  if (!assigneeIds?.length) return { items: [], total: 0 };

  const supabase = getSupabaseAdmin();
  const today = kstYmd();
  const dayStart = parseKstYmd(today).toISOString();
  const dayEnd = parseKstYmd(addDaysYmd(today, 1)).toISOString();
  const items: CrmCheckupItem[] = [];

  const leadStatusesForMemo = ["1차컨택", "부재(메신저완료)", "상담완료", "통화약속", "대면확정"];
  const leadSelect =
    "id, status, memo, meeting_at, status_changed_at, created_at, assignee_id";

  const [consumersRes, candidatesRes, tm001Res] = await Promise.all([
    supabase
      .from("leads")
      .select(leadSelect)
      .in("assignee_id", assigneeIds)
      .in("status", leadStatusesForMemo)
      .limit(800),
    supabase
      .from("tylife_b2b")
      .select(leadSelect)
      .in("assignee_id", assigneeIds)
      .in("status", leadStatusesForMemo)
      .limit(800),
    supabase
      .from("tm001_customers")
      .select("id, status, memo, comments, meeting_at, assignee_id")
      .eq("partner_code", TM001_PARTNER_CODE)
      .in("assignee_id", assigneeIds)
      .in("status", ["유효통화", "관심", "재콜", "미접촉", "부재"])
      .limit(800),
  ]);

  const consumerRows = (consumersRes.data ?? []) as Record<string, unknown>[];
  const candidateRows = (candidatesRes.data ?? []) as Record<string, unknown>[];
  const tmRows = (tm001Res.data ?? []) as Record<string, unknown>[];

  type LeadBucket = {
    memoMissing: string[];
    scheduleMissing: string[];
    statusStale: string[];
  };
  const emptyBucket = (): LeadBucket => ({
    memoMissing: [],
    scheduleMissing: [],
    statusStale: [],
  });

  const tallyLeads = (rows: Record<string, unknown>[]): LeadBucket => {
    const b = emptyBucket();
    for (const row of rows) {
      const id = String(row.id ?? "");
      if (!id) continue;
      const status = String(row.status ?? "");
      const memo = String(row.memo ?? "");
      const meetingAt = row.meeting_at ? String(row.meeting_at) : null;
      const since = String(row.status_changed_at || row.created_at || "");

      if (isMemoEssentiallyEmpty(memo)) b.memoMissing.push(id);
      if ((status === "통화약속" || status === "대면확정") && !meetingAt) b.scheduleMissing.push(id);
      if ((status === "1차컨택" || status === "부재(메신저완료)") && since) {
        if (calendarDaysElapsed(since) >= 2) b.statusStale.push(id);
      }
    }
    return b;
  };

  const consumers = tallyLeads(consumerRows);
  const candidates = tallyLeads(candidateRows);

  const tmMemoMissingIds: string[] = [];
  const tmRecallNoScheduleIds: string[] = [];
  const tmRecallTodayIds: string[] = [];

  for (const row of tmRows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const status = String(row.status ?? "");
    const memoEmpty = isMemoEssentiallyEmpty(String(row.memo ?? ""));
    const noComments = !hasTm001Comments(row.comments);
    const meetingAt = row.meeting_at ? String(row.meeting_at) : null;

    if ((status === "유효통화" || status === "관심" || status === "재콜") && memoEmpty && noComments) {
      tmMemoMissingIds.push(id);
    }
    if (status === "재콜" && !meetingAt) tmRecallNoScheduleIds.push(id);
    if (status === "재콜" && meetingAt) {
      const t = Date.parse(meetingAt);
      if (!Number.isNaN(t) && t >= Date.parse(dayStart) && t < Date.parse(dayEnd)) {
        tmRecallTodayIds.push(id);
      }
    }
  }

  const pushLeadPair = (opts: {
    key: string;
    label: string;
    consumerIds: string[];
    candidateIds: string[];
  }) => {
    pushItem(items, {
      key: `${opts.key}_consumers`,
      label: `소비자 · ${opts.label}`,
      count: opts.consumerIds.length,
      href: leadListHref("/admin/consumers", opts.consumerIds),
    });
    pushItem(items, {
      key: `${opts.key}_candidates`,
      label: `후보자 · ${opts.label}`,
      count: opts.candidateIds.length,
      href: leadListHref("/admin/candidates", opts.candidateIds),
    });
  };

  pushLeadPair({
    key: "lead_memo_missing",
    label: "상담일지(메모) 미작성",
    consumerIds: consumers.memoMissing,
    candidateIds: candidates.memoMissing,
  });
  pushLeadPair({
    key: "lead_schedule_missing",
    label: "통화약속·대면 / 일정 미등록",
    consumerIds: consumers.scheduleMissing,
    candidateIds: candidates.scheduleMissing,
  });
  pushLeadPair({
    key: "lead_status_stale",
    label: "상태값 오래됨(2일↑)",
    consumerIds: consumers.statusStale,
    candidateIds: candidates.statusStale,
  });
  pushItem(items, {
    key: "tm_memo_missing",
    label: "TM001 통화 완료 / 상담 메모·코멘트 미작성",
    count: tmMemoMissingIds.length,
    href: tmListHref(tmMemoMissingIds),
  });
  pushItem(items, {
    key: "tm_recall_no_schedule",
    label: "재콜 / 일정 미등록",
    count: tmRecallNoScheduleIds.length,
    href: tmListHref(tmRecallNoScheduleIds, "재콜"),
  });
  pushItem(items, {
    key: "tm_recall_today",
    label: "오늘 재콜 예정",
    count: tmRecallTodayIds.length,
    href: tmListHref(tmRecallTodayIds, "재콜"),
  });

  const total = items.reduce((n, i) => n + i.count, 0);
  return { items, total };
}
