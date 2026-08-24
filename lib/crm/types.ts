export const STAFF_RANKS = ["admin", "manager", "sales"] as const;
export type StaffRank = (typeof STAFF_RANKS)[number];

export const LEAD_STATUSES = [
  "배정전",
  "대기",
  "1차컨택",
  "부재(메신저완료)",
  "상담완료",
  "대면확정",
  "가입완료",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type LeadCategory = "consumers" | "candidates";

export type SessionUser = {
  rank: StaffRank;
  userId: string | null;
  name: string;
  loginId: string;
  region: string | null;
  parentId: string | null;
};

export type StaffUser = {
  id: string;
  name: string;
  phone: string;
  region: string | null;
  rank: "manager" | "sales";
  login_id: string;
  parent_id: string | null;
  parent_name?: string | null;
  is_active: boolean;
  created_at: string;
};

export type AdminStatusInfo = {
  key: "waiting_day" | "absent_day" | "done_day" | "need_reassign" | "need_recontact";
  label: string;
  tone: "danger";
};

export type LeadRow = {
  id: string;
  type: "소비자" | "후보자";
  created_at: string;
  created_at_iso: string;
  name: string;
  phone: string;
  entry_page: string;
  landing_preview: string;
  region: string;
  available_time: string;
  age_group: string;
  job: string;
  job_rank: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  marketing_consent: number | null;
  status: LeadStatus;
  memo: string;
  assignee_id: string | null;
  assignee_name: string;
  team_name: string;
  assigned_at: string | null;
  status_changed_at: string | null;
  meeting_at: string | null;
  admin_status: AdminStatusInfo | null;
};

export type AssignmentLog = {
  id: string;
  from_assignee_name: string;
  to_assignee_name: string;
  assigned_at: string;
  changed_by_name: string;
  reason: string;
};

export type MemoLog = {
  id: string;
  assignee_name: string;
  memo: string;
  created_at: string;
};
