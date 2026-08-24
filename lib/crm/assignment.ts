import { getSupabaseAdmin } from "@/lib/supabase";

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

export function matchRule(region: string | null | undefined, rules: AssignmentRule[]): AssignmentRule | null {
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

export async function loadAssignmentRules(): Promise<AssignmentRule[]> {
  const supabase = getSupabaseAdmin();
  const { data: rules, error } = await supabase
    .from("assignment_rules")
    .select("id, region_group, region_keywords, enabled")
    .order("region_group");
  if (error) throw error;
  const ids = (rules ?? []).map((r) => r.id);
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
  return (rules ?? []).map((r) => ({
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
    const enabled = await isAutoAssignEnabled();
    if (!enabled) return;
    const rules = await loadAssignmentRules();
    const rule = matchRule(opts.region, rules);
    if (!rule) return;
    const member = pickWeightedMember(rule.members);
    if (!member) return;

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from(opts.table)
      .update({
        assignee_id: member.staff_user_id,
        assigned_at: now,
        status: "대기",
        status_changed_at: now,
      })
      .eq("id", opts.leadId);
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
