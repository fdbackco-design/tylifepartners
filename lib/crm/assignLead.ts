import { appendStatusMemo } from "@/lib/crm/memo";
import { loadStaffMaps } from "@/lib/crm/mapLead";
import { canChangeAssignee } from "@/lib/crm/scope";
import { normalizeStatus, tableForCategory } from "@/lib/crm/status";
import type { LeadCategory, SessionUser } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function changeLeadAssignee(opts: {
  session: SessionUser;
  id: string;
  category: LeadCategory;
  assigneeId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  if (!canChangeAssignee(opts.session)) {
    return { ok: false, message: "담당자를 변경할 권한이 없습니다.", status: 403 };
  }

  const table = tableForCategory(opts.category);
  const supabase = getSupabaseAdmin();
  const { data: current, error: loadErr } = await (supabase.from(table) as any)
    .select("id, assignee_id, status, memo")
    .eq("id", opts.id)
    .maybeSingle();

  if (loadErr || !current) {
    return { ok: false, message: "리드를 찾을 수 없습니다.", status: 404 };
  }

  const curAssignee = (current as { assignee_id?: string | null }).assignee_id ?? null;
  const nextAssignee = opts.assigneeId;
  if (nextAssignee === curAssignee) return { ok: true };

  const now = new Date();
  const nowIso = now.toISOString();
  let nextMemo = String((current as { memo?: string | null }).memo ?? "");
  const currentStatus = normalizeStatus((current as { status?: string }).status);
  let nextStatus = currentStatus;
  const patch: Record<string, unknown> = {
    assignee_id: nextAssignee,
    assigned_at: nowIso,
  };

  const { staffById } = await loadStaffMaps();
  await supabase.from("lead_memo_logs").insert({
    lead_table: table,
    lead_id: opts.id,
    assignee_id: curAssignee,
    assignee_name: curAssignee ? staffById.get(curAssignee)?.name ?? "" : "",
    memo: nextMemo,
  });
  await supabase.from("lead_assignment_logs").insert({
    lead_table: table,
    lead_id: opts.id,
    from_assignee_id: curAssignee,
    to_assignee_id: nextAssignee,
    assigned_at: nowIso,
    changed_by: opts.session.userId,
    changed_by_name: opts.session.name,
    reason: "manual",
  });

  if (nextAssignee && !curAssignee && (nextStatus === "배정전" || nextStatus === "대기")) {
    // 미배정 → 담당자 지정: 대기로 두고 대기 일차를 오늘부터 시작
    if (nextStatus === "배정전") {
      nextMemo = appendStatusMemo(nextMemo, "대기", now);
      patch.memo = nextMemo;
    }
    nextStatus = "대기";
    patch.status = "대기";
    patch.status_changed_at = nowIso;
    await supabase.from("lead_status_logs").insert({
      lead_table: table,
      lead_id: opts.id,
      from_status: currentStatus,
      to_status: "대기",
      assignee_id: nextAssignee,
      changed_at: nowIso,
      changed_by_name: opts.session.name,
    });
  } else if (nextAssignee && nextStatus === "배정전") {
    nextMemo = appendStatusMemo(nextMemo, "대기", now);
    nextStatus = "대기";
    patch.status = "대기";
    patch.status_changed_at = nowIso;
    patch.memo = nextMemo;
    await supabase.from("lead_status_logs").insert({
      lead_table: table,
      lead_id: opts.id,
      from_status: currentStatus,
      to_status: "대기",
      assignee_id: nextAssignee,
      changed_at: nowIso,
      changed_by_name: opts.session.name,
    });
  }

  const { error: updErr } = await supabase.from(table).update(patch).eq("id", opts.id);
  if (updErr) {
    console.error("changeLeadAssignee:", updErr);
    return { ok: false, message: "저장 중 오류가 발생했습니다.", status: 500 };
  }
  return { ok: true };
}
