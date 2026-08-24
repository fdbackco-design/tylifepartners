import { landingPreviewSrc } from "@/lib/crm/landingPreview";
import { formatKstDateTime } from "@/lib/crm/kst";
import { getAdminStatus, normalizeStatus } from "@/lib/crm/status";
import type { LeadRow } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

type StaffLite = { id: string; name: string; parent_id: string | null };

export function mapLeadRow(
  row: Record<string, unknown>,
  kind: "consumers" | "candidates",
  staffById: Map<string, StaffLite>,
  parentNameById: Map<string, string>
): LeadRow {
  const createdIso = String(row.created_at ?? "");
  const assigneeId = row.assignee_id ? String(row.assignee_id) : null;
  const staff = assigneeId ? staffById.get(assigneeId) : undefined;
  const teamName = staff?.parent_id ? parentNameById.get(staff.parent_id) ?? "" : staff?.name ?? "";
  const status = normalizeStatus(row.status as string);
  const statusChanged = row.status_changed_at ? String(row.status_changed_at) : null;
  const region = String(row.region ?? row.location ?? "");
  const available = String(row.available_time ?? row.desired_time ?? "");
  const entry = String(row.entry_page ?? "");

  return {
    id: String(row.id),
    type: kind === "candidates" ? "후보자" : "소비자",
    created_at: createdIso ? formatKstDateTime(new Date(createdIso)) : "",
    created_at_iso: createdIso,
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    entry_page: entry,
    landing_preview: landingPreviewSrc(entry),
    region,
    available_time: available,
    age_group: String(row.age_group ?? ""),
    job: String(row.job ?? ""),
    job_rank: String(row.job_rank ?? ""),
    utm_source: String(row.utm_source ?? ""),
    utm_medium: String(row.utm_medium ?? ""),
    utm_campaign: String(row.utm_campaign ?? ""),
    utm_content: String(row.utm_content ?? ""),
    utm_term: String(row.utm_term ?? ""),
    marketing_consent: row.marketing_consent == null ? null : Number(row.marketing_consent),
    status,
    memo: String(row.memo ?? ""),
    assignee_id: assigneeId,
    assignee_name: staff?.name ?? "",
    team_name: teamName,
    assigned_at: row.assigned_at ? String(row.assigned_at) : null,
    status_changed_at: statusChanged,
    meeting_at: row.meeting_at ? String(row.meeting_at) : null,
    admin_status: getAdminStatus(status, statusChanged, createdIso),
  };
}

export const CONSUMER_SELECT =
  "id, name, phone, created_at, status, memo, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term, marketing_consent, region, available_time, age_group, job, job_rank, location, desired_time, assignee_id, assigned_at, status_changed_at, meeting_at";

export const CANDIDATE_SELECT =
  "id, name, phone, created_at, status, memo, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term, marketing_consent, region, available_time, age_group, job, job_rank, assignee_id, assigned_at, status_changed_at, meeting_at";

export async function loadStaffMaps() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("staff_users").select("id, name, parent_id, rank, is_active").eq("is_active", true);
  const staffById = new Map<string, StaffLite>();
  const parentNameById = new Map<string, string>();
  for (const r of data ?? []) {
    staffById.set(r.id, r);
    parentNameById.set(r.id, r.name);
  }
  const { data: all } = await supabase.from("staff_users").select("id, name, parent_id, rank, is_active");
  for (const r of all ?? []) {
    parentNameById.set(r.id, r.name);
    if (!staffById.has(r.id)) staffById.set(r.id, { id: r.id, name: r.name, parent_id: r.parent_id });
  }
  return { staffById, parentNameById, staff: all ?? [] };
}