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

/** 포함 지역 키워드 우선 매칭 → 없으면 고정 권역 정규화 폴백 */
export function matchRule(region: string | null | undefined, rules: AssignmentRule[]): AssignmentRule | null {
  const enabled = rules.filter((r) => r.enabled);
  const text = String(region ?? "").replace(/\s/g, "");
  let best: AssignmentRule | null = null;
  let bestLen = 0;
  if (text) {
    for (const rule of enabled) {
      for (const kw of rule.region_keywords ?? []) {
        const k = String(kw).replace(/\s/g, "");
        if (k && text.includes(k) && k.length > bestLen) {
          best = rule;
          bestLen = k.length;
        }
      }
    }
  }
  if (best) return best;

  const zone = resolveRegionZone(region);
  if (!zone) return null;
  return enabled.find((r) => r.region_group === zone) ?? null;
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

/** 6개 기본 권역 규칙이 DB에 있는지 보장 (기존 enabled·keywords는 유지) */
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

function sortRules<T extends { region_group: string; created_at?: string }>(rows: T[]): T[] {
  const fixedOrder = new Map<string, number>(REGION_ZONE_NAMES.map((n, i) => [n, i]));
  return [...rows].sort((a, b) => {
    const ai = fixedOrder.has(a.region_group) ? fixedOrder.get(a.region_group)! : 1000;
    const bi = fixedOrder.has(b.region_group) ? fixedOrder.get(b.region_group)! : 1000;
    if (ai !== bi) return ai - bi;
    return String(a.region_group).localeCompare(String(b.region_group), "ko");
  });
}

export async function loadAssignmentRules(): Promise<AssignmentRule[]> {
  await ensureFixedAssignmentRules();
  const supabase = getSupabaseAdmin();
  const { data: rules, error } = await supabase
    .from("assignment_rules")
    .select("id, region_group, region_keywords, enabled, created_at");
  if (error) throw error;

  const ordered = sortRules(rules ?? []);
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
    const enabled = await isAutoAssignEnabled();
    const rules = await loadAssignmentRules();
    const rule = matchRule(opts.region, rules);
    const zone = rule?.region_group ?? resolveRegionZone(opts.region);

    await supabase
      .from(opts.table)
      .update({ region_zone: zone ?? null })
      .eq("id", opts.leadId);

    if (!enabled || !rule) return;

    const memberIds = rule.members.map((m) => m.staff_user_id).filter(Boolean);
    if (!memberIds.length) return;

    const { data: staffRows } = await supabase
      .from("staff_users")
      .select("id, rank, is_active")
      .eq("is_active", true)
      .in("rank", ["sales", "manager"])
      .in("id", memberIds);

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
        region_zone: rule.region_group,
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

export function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
