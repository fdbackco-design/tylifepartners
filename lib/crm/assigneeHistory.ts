import { buildAssigneeNameChain } from "@/lib/crm/assigneeHistoryFormat";
import type { LeadRow } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

type LogRow = {
  lead_id: string;
  from_assignee_id: string | null;
  to_assignee_id: string | null;
  assigned_at: string;
};

export { buildAssigneeNameChain, formatAssigneeWithTeam } from "@/lib/crm/assigneeHistoryFormat";

/** 목록 리드들에 담당자 변경 체인 붙이기 */
export async function attachAssigneeHistories(items: LeadRow[]): Promise<LeadRow[]> {
  if (!items.length) return items;
  const supabase = getSupabaseAdmin();
  const consumerIds = items.filter((i) => i.type === "소비자").map((i) => i.id);
  const candidateIds = items.filter((i) => i.type === "후보자").map((i) => i.id);

  const fetchLogs = async (table: "leads" | "tylife_b2b", ids: string[]) => {
    if (!ids.length) return [] as LogRow[];
    const { data, error } = await supabase
      .from("lead_assignment_logs")
      .select("lead_id, from_assignee_id, to_assignee_id, assigned_at")
      .eq("lead_table", table)
      .in("lead_id", ids)
      .order("assigned_at", { ascending: true });
    if (error) {
      console.error("attachAssigneeHistories:", error);
      return [];
    }
    return (data ?? []) as LogRow[];
  };

  const [consumerLogs, candidateLogs] = await Promise.all([
    fetchLogs("leads", consumerIds),
    fetchLogs("tylife_b2b", candidateIds),
  ]);

  const staffIds = new Set<string>();
  for (const log of [...consumerLogs, ...candidateLogs]) {
    if (log.from_assignee_id) staffIds.add(log.from_assignee_id);
    if (log.to_assignee_id) staffIds.add(log.to_assignee_id);
  }

  const nameById = new Map<string, string>();
  if (staffIds.size) {
    const { data: staff } = await supabase
      .from("staff_users")
      .select("id, name")
      .in("id", Array.from(staffIds));
    for (const s of staff ?? []) nameById.set(s.id, s.name);
  }
  const nameOf = (id: string | null | undefined) => (id ? nameById.get(id) ?? "" : "");

  const byLead = new Map<string, LogRow[]>();
  for (const log of [...consumerLogs, ...candidateLogs]) {
    const list = byLead.get(log.lead_id) ?? [];
    list.push(log);
    byLead.set(log.lead_id, list);
  }

  return items.map((item) => ({
    ...item,
    assignee_history: buildAssigneeNameChain(byLead.get(item.id) ?? [], nameOf),
  }));
}
