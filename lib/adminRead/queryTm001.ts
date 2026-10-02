import { listTm001Customers } from "@/lib/crm/tm001/store";

export async function queryAdminReadTm001(sp: URLSearchParams, limit: number, offset: number) {
  const { items, total, stayTotal } = await listTm001Customers({
    q: sp.get("q") || "",
    region: sp.get("region") || "",
    status: sp.get("status") || "",
    ids: String(sp.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    assigneeId: sp.get("assignee_id") || "",
    unassignedOnly: sp.get("unassigned") === "1",
    assignedDate: sp.get("assigned_date") || "",
    visibleAssigneeIds: "all",
    limit,
    offset,
    includeHistory: true,
    includeStayTotal: offset === 0,
    includeRegions: false,
  });
  return { items, total, stayTotal };
}
