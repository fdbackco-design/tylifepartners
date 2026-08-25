import { appendStatusMemo } from "@/lib/crm/memo";
import { assertLeadMutable } from "@/lib/crm/merge/execute";
import { canChangeAssignee } from "@/lib/crm/scope";
import { normalizeStatus, tableForCategory } from "@/lib/crm/status";
import type { LeadCategory, SessionUser } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyAssigneeAssigned } from "@/lib/webPush";

async function notifyAssigneeForLead(
  table: "leads" | "tylife_b2b",
  leadId: string,
  assigneeId: string
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from(table).select("name, phone").eq("id", leadId).maybeSingle();
    if (!data?.name) return;
    await notifyAssigneeAssigned({
      assigneeId,
      kind: table === "tylife_b2b" ? "candidates" : "consumers",
      name: String(data.name),
      phone: String(data.phone ?? ""),
      leadId,
    });
  } catch (e) {
    console.warn("[webPush] assignee notify:", e instanceof Error ? e.message : e);
  }
}

type LeadAssigneeSnapshot = {
  id: string;
  assignee_id?: string | null;
  status?: string | null;
  memo?: string | null;
  merge_status?: string | null;
};

export async function changeLeadAssignee(opts: {
  session: SessionUser;
  id: string;
  category: LeadCategory;
  assigneeId: string | null;
  /** PATCH 등에서 이미 로드한 행이면 재조회 생략 */
  current?: LeadAssigneeSnapshot | null;
  /** 이미 병합 여부 검증했으면 skip */
  skipMutableCheck?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  if (!canChangeAssignee(opts.session)) {
    return { ok: false, message: "담당자를 변경할 권한이 없습니다.", status: 403 };
  }

  const table = tableForCategory(opts.category);
  if (!opts.skipMutableCheck) {
    const mutable = await assertLeadMutable(table, opts.id);
    if (!mutable.ok) {
      return { ok: false, message: mutable.message, status: 409 };
    }
  }

  const supabase = getSupabaseAdmin();
  let current = opts.current ?? null;
  if (!current) {
    const { data, error: loadErr } = await (supabase.from(table) as any)
      .select("id, assignee_id, status, memo")
      .eq("id", opts.id)
      .maybeSingle();
    if (loadErr || !data) {
      return { ok: false, message: "리드를 찾을 수 없습니다.", status: 404 };
    }
    current = data as LeadAssigneeSnapshot;
  }

  const curAssignee = current.assignee_id ?? null;
  const nextAssignee = opts.assigneeId;
  if (nextAssignee === curAssignee) return { ok: true };

  const now = new Date();
  const nowIso = now.toISOString();
  let nextMemo = String(current.memo ?? "");
  const currentStatus = normalizeStatus(current.status);
  let nextStatus = currentStatus;
  const patch: Record<string, unknown> = {
    assignee_id: nextAssignee,
    assigned_at: nowIso,
  };

  // 이전 담당자 표시용 이름만 최소 조회
  let curAssigneeName = "";
  if (curAssignee) {
    const { data: staffRow } = await supabase.from("staff_users").select("name").eq("id", curAssignee).maybeSingle();
    curAssigneeName = staffRow?.name ?? "";
  }

  const writes: Array<PromiseLike<unknown>> = [
    supabase.from("lead_assignment_logs").insert({
      lead_table: table,
      lead_id: opts.id,
      from_assignee_id: curAssignee,
      to_assignee_id: nextAssignee,
      assigned_at: nowIso,
      changed_by: opts.session.userId,
      changed_by_name: opts.session.name,
      reason: "manual",
    }),
  ];

  if (nextMemo.trim()) {
    writes.push(
      supabase.from("lead_memo_logs").insert({
        lead_table: table,
        lead_id: opts.id,
        assignee_id: curAssignee,
        assignee_name: curAssigneeName,
        memo: nextMemo,
      })
    );
  }

  if (nextAssignee && !curAssignee && (nextStatus === "배정전" || nextStatus === "대기")) {
    if (nextStatus === "배정전") {
      nextMemo = appendStatusMemo(nextMemo, "대기", now);
      patch.memo = nextMemo;
    }
    nextStatus = "대기";
    patch.status = "대기";
    patch.status_changed_at = nowIso;
    writes.push(
      supabase.from("lead_status_logs").insert({
        lead_table: table,
        lead_id: opts.id,
        from_status: currentStatus,
        to_status: "대기",
        assignee_id: nextAssignee,
        changed_at: nowIso,
        changed_by_name: opts.session.name,
      })
    );
  } else if (nextAssignee && nextStatus === "배정전") {
    nextMemo = appendStatusMemo(nextMemo, "대기", now);
    nextStatus = "대기";
    patch.status = "대기";
    patch.status_changed_at = nowIso;
    patch.memo = nextMemo;
    writes.push(
      supabase.from("lead_status_logs").insert({
        lead_table: table,
        lead_id: opts.id,
        from_status: currentStatus,
        to_status: "대기",
        assignee_id: nextAssignee,
        changed_at: nowIso,
        changed_by_name: opts.session.name,
      })
    );
  }

  writes.push(supabase.from(table).update(patch).eq("id", opts.id));

  const results = await Promise.all(writes);
  for (const r of results) {
    const err = (r as { error?: { message?: string } | null })?.error;
    if (err) {
      console.error("changeLeadAssignee:", err);
      return { ok: false, message: "저장 중 오류가 발생했습니다.", status: 500 };
    }
  }

  if (nextAssignee) {
    void notifyAssigneeForLead(table, opts.id, nextAssignee);
  }

  return { ok: true };
}
