import { getSupabaseAdmin } from "@/lib/supabase";
import {
  keywordsForZone,
  REGION_ZONE_NAMES,
  resolveRegionZone,
  type RegionZoneName,
} from "@/lib/crm/regionZones";

export type AssignmentMember = {
  id: string;
  staff_user_id: string;
  weight: number;
  assigned_count: number;
};

export type AssignmentRule = {
  id: string;
  region_group: string;
  region_keywords: string[];
  enabled: boolean;
  members: AssignmentMember[];
};

export async function isAutoAssignEnabled(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("crm_settings").select("value").eq("key", "auto_assign_enabled").maybeSingle();
  if (error || !data) return true;
  const v = data.value;
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return true;
}

/** @deprecated 키워드 매칭 — 테스트·하위호환용. 배정은 resolveRegionZone 사용 */
export function matchRule(region: string | null | undefined, rules: AssignmentRule[]): AssignmentRule | null {
  const zone = resolveRegionZone(region);
  if (zone) {
    const byZone = rules.find((r) => r.enabled && r.region_group === zone);
    if (byZone) return byZone;
  }
  const text = String(region ?? "").replace(/\s/g, "");
  if (!text) return null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const kw of rule.region_keywords ?? []) {
      const k = String(kw).replace(/\s/g, "");
      if (k && text.includes(k)) return rule;
    }
  }
  return null;
}

export function pickWeightedMember(members: AssignmentMember[]): AssignmentMember | null {
  const active = members.filter((m) => m.staff_user_id);
  if (active.length === 0) return null;
  let best = active[0];
  let bestScore = best.assigned_count / Math.max(best.weight, 1);
  for (const m of active.slice(1)) {
    const score = m.assigned_count / Math.max(m.weight, 1);
    if (score < bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/** 6개 고정 권역 규칙이 DB에 있는지 보장 (기존 enabled는 유지) */
export async function ensureFixedAssignmentRules(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("assignment_rules")
    .select("id, region_group")
    .in("region_group", [...REGION_ZONE_NAMES]);
  const have = new Set((existing ?? []).map((r) => r.region_group as string));
  for (const zone of REGION_ZONE_NAMES) {
    if (have.has(zone)) continue;
    await supabase.from("assignment_rules").insert({
      region_group: zone,
      region_keywords: keywordsForZone(zone),
      enabled: true,
    });
  }
}

export async function loadAssignmentRules(): Promise<AssignmentRule[]> {
  await ensureFixedAssignmentRules();
  const supabase = getSupabaseAdmin();
  const { data: rules, error } = await supabase
    .from("assignment_rules")
    .select("id, region_group, region_keywords, enabled")
    .in("region_group", [...REGION_ZONE_NAMES]);
  if (error) throw error;

  const ordered = REGION_ZONE_NAMES.map((name) => (rules ?? []).find((r) => r.region_group === name)).filter(
    Boolean
  ) as { id: string; region_group: string; region_keywords: string[]; enabled: boolean }[];

  const ids = ordered.map((r) => r.id);
  const { data: members } = ids.length
    ? await supabase
        .from("assignment_rule_members")
        .select("id, rule_id, staff_user_id, weight, assigned_count")
        .in("rule_id", ids)
    : { data: [] as { id: string; rule_id: string; staff_user_id: string; weight: number; assigned_count: number }[] };

  const byRule = new Map<string, AssignmentMember[]>();
  for (const m of members ?? []) {
    const list = byRule.get(m.rule_id) ?? [];
    list.push({
      id: m.id,
      staff_user_id: m.staff_user_id,
      weight: m.weight,
      assigned_count: m.assigned_count,
    });
    byRule.set(m.rule_id, list);
  }
  return ordered.map((r) => ({
    id: r.id,
    region_group: r.region_group,
    region_keywords: r.region_keywords ?? [],
    enabled: r.enabled,
    members: byRule.get(r.id) ?? [],
  }));
}

export async function tryAutoAssignLead(opts: {
  table: "leads" | "tylife_b2b";
  leadId: string;
  region: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const zone = resolveRegionZone(opts.region);

    // 원본 region은 유지하고 정규화 권역만 별도 저장
    if (zone) {
      await supabase.from(opts.table).update({ region_zone: zone }).eq("id", opts.leadId);
    } else {
      await supabase.from(opts.table).update({ region_zone: null }).eq("id", opts.leadId);
      return;
    }

    const enabled = await isAutoAssignEnabled();
    if (!enabled) return;

    const rules = await loadAssignmentRules();
    const rule = rules.find((r) => r.region_group === zone && r.enabled);
    if (!rule) return;

    const { data: staffRows } = await supabase
      .from("staff_users")
      .select("id, region, rank, is_active")
      .eq("is_active", true)
      .eq("rank", "sales")
      .eq("region", zone);

    const allowed = new Set((staffRows ?? []).map((s) => s.id as string));
    const eligible = rule.members.filter((m) => allowed.has(m.staff_user_id));
    const member = pickWeightedMember(eligible);
    if (!member) return;

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from(opts.table)
      .update({
        assignee_id: member.staff_user_id,
        assigned_at: now,
        status: "대기",
        status_changed_at: now,
        region_zone: zone,
      })
      .eq("id", opts.leadId)
      .is("assignee_id", null);
    if (updErr) {
      console.error("tryAutoAssignLead update:", updErr);
      return;
    }

    await supabase.from("assignment_rule_members").update({ assigned_count: member.assigned_count + 1 }).eq("id", member.id);
    await supabase.from("lead_assignment_logs").insert({
      lead_table: opts.table,
      lead_id: opts.leadId,
      from_assignee_id: null,
      to_assignee_id: member.staff_user_id,
      assigned_at: now,
      changed_by: null,
      changed_by_name: "자동배정",
      reason: "auto",
    });
  } catch (e) {
    console.error("tryAutoAssignLead:", e);
  }
}

export function zoneOfRule(regionGroup: string): RegionZoneName | null {
  return REGION_ZONE_NAMES.includes(regionGroup as RegionZoneName) ? (regionGroup as RegionZoneName) : null;
}
