import { listTm002Customers } from "@/lib/crm/tm002/store";

export async function queryAdminReadTm002(sp: URLSearchParams, limit: number, offset: number) {
  const { items, total } = await listTm002Customers({
    q: sp.get("q") || "",
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
  });
  return { items, total };
}
