import { loadHiddenLeadIdMaps } from "@/lib/crm/leadListHide";
import { getSupabaseAdmin } from "@/lib/supabase";

const PAGE_SIZE = 2000;

async function countAssignedInTable(
  table: "leads" | "tylife_b2b",
  hiddenIds: Set<string>,
  counts: Map<string, number>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("id, assignee_id")
      .not("assignee_id", "is", null)
      .or("merge_status.eq.active,merge_status.is.null")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.warn(`[staffLeadCounts] ${table}:`, error.message);
      return;
    }

    const rows = data ?? [];
    for (const row of rows) {
      const id = String(row.id ?? "");
      if (hiddenIds.has(id)) continue;
      const assigneeId = String(row.assignee_id ?? "");
      if (!assigneeId) continue;
      counts.set(assigneeId, (counts.get(assigneeId) ?? 0) + 1);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
}

/** 담당자별 현재 배정 DB 수 (소비자+후보자, 병합·숨김 제외) */
export async function loadAssignedLeadCountsByStaff(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const hidden = await loadHiddenLeadIdMaps();
  await Promise.all([
    countAssignedInTable("leads", hidden.leads, counts),
    countAssignedInTable("tylife_b2b", hidden.tylife_b2b, counts),
  ]);
  return counts;
}
