import { calendarDaysInclusive } from "@/lib/crm/kst";
import type { AdminStatusInfo, LeadStatus, SessionUser } from "@/lib/crm/types";
import { LEAD_STATUSES } from "@/lib/crm/types";

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function normalizeStatus(raw: string | null | undefined): LeadStatus {
  const s = String(raw ?? "").trim();
  if (s === "상담 완료") return "상담완료";
  if (isLeadStatus(s)) return s;
  return "배정전";
}

export function getAdminStatus(
  status: string,
  statusChangedAt: string | null | undefined,
  createdAt: string
): AdminStatusInfo | null {
  const st = normalizeStatus(status);
  const days = calendarDaysInclusive(statusChangedAt || createdAt);
  if (st === "대기") {
    if (days >= 3) return { key: "need_reassign", label: "담당자 변경 필요", tone: "danger" };
    return { key: "waiting_day", label: `대기 ${days}일차`, tone: "danger" };
  }
  if (st === "부재(메신저완료)") {
    if (days >= 3) return { key: "need_reassign", label: "담당자 변경 필요", tone: "danger" };
    return { key: "absent_day", label: `부재 ${days}일차`, tone: "danger" };
  }
  if (st === "상담완료") {
    if (days > 7) return { key: "need_recontact", label: "재컨택 필요", tone: "danger" };
    return { key: "done_day", label: `상담완료 ${days}일차`, tone: "danger" };
  }
  return null;
}

/**
 * 상담상태 선택지:
 * - 배정전: 배정전만
 * - 대기: 대기, 1차컨택만
 * - 1차컨택 이후: 1차컨택, 부재(메신저완료), 상담완료, 대면확정, 가입완료
 */
export function allowedStatusesFor(_session: SessionUser, current: LeadStatus): LeadStatus[] {
  if (current === "배정전") return ["배정전"];
  if (current === "대기") return ["대기", "1차컨택"];
  return ["1차컨택", "부재(메신저완료)", "상담완료", "대면확정", "가입완료"];
}

export function isMemoEditable(status: LeadStatus): boolean {
  return status !== "배정전" && status !== "대기";
}

export function rowBackground(status: LeadStatus): string | undefined {
  if (status === "배정전") return "#fff4e6";
  if (status === "대기" || status === "부재(메신저완료)") return "#fffde7";
  if (status === "대면확정") return "#e8f5e9";
  if (status === "가입완료") return "#f3e5f5";
  return undefined;
}

export function tableForCategory(category: "consumers" | "candidates"): "leads" | "tylife_b2b" {
  return category === "candidates" ? "tylife_b2b" : "leads";
}
