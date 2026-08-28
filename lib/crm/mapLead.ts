import { landingPreviewSrc } from "@/lib/crm/landingPreview";
import { formatKstDateTime } from "@/lib/crm/kst";
import { getAdminStatus, normalizeStatus } from "@/lib/crm/status";
import { getOrLoadTtlCache } from "@/lib/crm/ttlCache";
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
  const teamName = staff?.parent_id ? parentNameById.get(staff.parent_id) ?? "" : "";
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
    meta_ad_id: row.meta_ad_id ? String(row.meta_ad_id) : null,
    meta_ad_name: null,
    meta_creative_type: null,
    meta_creative_preview: null,
    meta_creative_full: null,
    meta_creative_status: null,
    marketing_consent: row.marketing_consent == null ? null : Number(row.marketing_consent),
    status,
    memo: String(row.memo ?? ""),
    admin_comment: String(row.admin_comment ?? ""),
    assignee_id: assigneeId,
    assignee_name: staff?.name ?? "",
    team_name: teamName,
    assignee_history: [],
    assigned_at: row.assigned_at ? String(row.assigned_at) : null,
    status_changed_at: statusChanged,
    meeting_at: row.meeting_at ? String(row.meeting_at) : null,
    admin_status: getAdminStatus(status, statusChanged, createdIso, assigneeId),
  };
}

export const CONSUMER_SELECT =
  "id, name, phone, created_at, status, memo, admin_comment, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term, meta_ad_id, marketing_consent, region, region_zone, available_time, age_group, job, job_rank, location, desired_time, assignee_id, assigned_at, status_changed_at, meeting_at, merge_status, normalized_phone";

export const CANDIDATE_SELECT =
  "id, name, phone, created_at, status, memo, admin_comment, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term, meta_ad_id, marketing_consent, region, region_zone, available_time, age_group, job, job_rank, assignee_id, assigned_at, status_changed_at, meeting_at, merge_status, normalized_phone";

const STAFF_MAPS_CACHE_KEY = "crm:staff-maps";
const STAFF_MAPS_TTL_MS = 30_000;

async function loadStaffMapsUncached() {
  const supabase = getSupabaseAdmin();
  // active + inactive를 한 번에 읽어 부모 이름 매핑과 목록용 staff를 함께 구성
  const { data: all } = await supabase
    .from("staff_users")
    .select("id, name, parent_id, rank, is_active");
  const staffById = new Map<string, StaffLite>();
  const parentNameById = new Map<string, string>();
  const active: Array<StaffLite & { rank?: string; is_active?: boolean }> = [];
  for (const r of all ?? []) {
    const lite = { id: r.id, name: r.name, parent_id: r.parent_id };
    staffById.set(r.id, lite);
    parentNameById.set(r.id, r.name);
    if (r.is_active !== false) {
      active.push({ ...lite, rank: r.rank, is_active: true });
    }
  }
  return { staffById, parentNameById, staff: active };
}

export async function loadStaffMaps() {
  return getOrLoadTtlCache(STAFF_MAPS_CACHE_KEY, STAFF_MAPS_TTL_MS, loadStaffMapsUncached);
}