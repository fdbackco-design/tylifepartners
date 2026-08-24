import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { appendStatusMemo } from "@/lib/crm/memo";
import { changeLeadAssignee } from "@/lib/crm/assignLead";
import { CANDIDATE_SELECT, CONSUMER_SELECT, loadStaffMaps, mapLeadRow } from "@/lib/crm/mapLead";
import { visibleAssigneeIds } from "@/lib/crm/scope";
import { allowedStatusesFor, isLeadStatus, isMemoEditable, normalizeStatus, tableForCategory } from "@/lib/crm/status";
import type { LeadCategory } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

function categoryOf(request: NextRequest): LeadCategory {
  const cat = request.nextUrl.searchParams.get("category");
  return cat === "candidates" || cat === "b2b" ? "candidates" : "consumers";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  const { id } = await params;
  const category = categoryOf(request);
  const table = tableForCategory(category);
  const supabase = getSupabaseAdmin();
  const select = category === "candidates" ? CANDIDATE_SELECT : CONSUMER_SELECT;
  const { data, error } = await (supabase.from(table) as any).select(select).eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, message: "리드를 찾을 수 없습니다." }, { status: 404 });

  const scoped = await visibleAssigneeIds(session);
  const assigneeId = (data as { assignee_id?: string | null }).assignee_id ?? null;
  if (scoped !== "all" && session.rank === "sales" && assigneeId !== session.userId) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const { staffById, parentNameById } = await loadStaffMaps();
  const item = mapLeadRow(data as Record<string, unknown>, category, staffById, parentNameById);

  const [{ data: assignLogs }, { data: memoLogs }, { data: statusLogs }] = await Promise.all([
    supabase
      .from("lead_assignment_logs")
      .select("id, from_assignee_id, to_assignee_id, assigned_at, changed_by_name, reason")
      .eq("lead_table", table)
      .eq("lead_id", id)
      .order("assigned_at", { ascending: false })
      .limit(20),
    supabase
      .from("lead_memo_logs")
      .select("id, assignee_name, memo, created_at")
      .eq("lead_table", table)
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("lead_status_logs")
      .select("id, from_status, to_status, changed_at, changed_by_name")
      .eq("lead_table", table)
      .eq("lead_id", id)
      .order("changed_at", { ascending: false })
      .limit(20),
  ]);

  const nameOf = (uid: string | null | undefined) => (uid ? staffById.get(uid)?.name ?? "" : "");

  return NextResponse.json({
    ok: true,
    item,
    allowed_statuses: allowedStatusesFor(session, item.status),
    assignment_logs: (assignLogs ?? []).map((l) => ({
      id: l.id,
      from_assignee_name: nameOf(l.from_assignee_id),
      to_assignee_name: nameOf(l.to_assignee_id),
      assigned_at: l.assigned_at,
      changed_by_name: l.changed_by_name,
      reason: l.reason,
    })),
    memo_logs: memoLogs ?? [],
    status_logs: statusLogs ?? [],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const category = categoryOf(request);
  const table = tableForCategory(category);
  const supabase = getSupabaseAdmin();
  const select = category === "candidates" ? CANDIDATE_SELECT : CONSUMER_SELECT;
  const { data: current, error: loadErr } = await (supabase.from(table) as any).select(select).eq("id", id).maybeSingle();
  if (loadErr || !current) {
    return NextResponse.json({ ok: false, message: "리드를 찾을 수 없습니다." }, { status: 404 });
  }

  const scoped = await visibleAssigneeIds(session);
  const curAssignee = (current as { assignee_id?: string | null }).assignee_id ?? null;
  if (scoped !== "all" && session.rank === "sales" && curAssignee !== session.userId) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json();
  const now = new Date();
  const nowIso = now.toISOString();
  const patch: Record<string, unknown> = {};
  let nextMemo = String((current as { memo?: string | null }).memo ?? "");
  const currentStatus = normalizeStatus((current as { status?: string }).status);
  let nextStatus = currentStatus;
  let assigneeChanged = false;

  if (body.assignee_id !== undefined) {
    const nextAssignee = body.assignee_id ? String(body.assignee_id) : null;
    const assignResult = await changeLeadAssignee({
      session,
      id,
      category,
      assigneeId: nextAssignee,
    });
    if (!assignResult.ok) {
      return NextResponse.json({ ok: false, message: assignResult.message }, { status: assignResult.status });
    }
    assigneeChanged = true;
    const { data: refreshed } = await (supabase.from(table) as any).select(select).eq("id", id).maybeSingle();
    if (refreshed) Object.assign(current, refreshed);
    nextMemo = String((current as { memo?: string | null }).memo ?? "");
    nextStatus = normalizeStatus((current as { status?: string }).status);
  }

  if (body.status != null) {
    const requested = String(body.status).trim();
    if (!isLeadStatus(requested)) {
      return NextResponse.json({ ok: false, message: "허용되지 않은 상태입니다." }, { status: 400 });
    }
    const allowed = allowedStatusesFor(session, nextStatus);
    if (!allowed.includes(requested)) {
      return NextResponse.json({ ok: false, message: "해당 상태로 변경할 수 없습니다." }, { status: 400 });
    }
    if (requested !== nextStatus) {
      nextMemo = appendStatusMemo(nextMemo, requested, now);
      patch.status = requested;
      patch.status_changed_at = nowIso;
      patch.memo = nextMemo;
      const assigneeForLog =
        (current as { assignee_id?: string | null }).assignee_id ?? curAssignee;
      await supabase.from("lead_status_logs").insert({
        lead_table: table,
        lead_id: id,
        from_status: nextStatus,
        to_status: requested,
        assignee_id: assigneeForLog,
        changed_at: nowIso,
        changed_by_name: session.name,
      });
      nextStatus = requested;
    }
  }

  if (body.memo != null && body.status == null) {
    if (!isMemoEditable(nextStatus)) {
      return NextResponse.json({ ok: false, message: "배정전·대기 상태에서는 메모를 수정할 수 없습니다." }, { status: 400 });
    }
    patch.memo = String(body.memo);
  }

  if (body.meeting_at !== undefined) {
    if (nextStatus !== "대면확정" && body.meeting_at) {
      return NextResponse.json({ ok: false, message: "대면확정 상태에서만 일정을 지정할 수 있습니다." }, { status: 400 });
    }
    patch.meeting_at = body.meeting_at ? String(body.meeting_at) : null;
  }

  if (Object.keys(patch).length === 0 && !assigneeChanged) {
    return NextResponse.json({ ok: false, message: "수정할 내용이 없습니다." }, { status: 400 });
  }

  if (Object.keys(patch).length > 0) {
    const { error: updErr } = await supabase.from(table).update(patch).eq("id", id);
    if (updErr) {
      console.error("PATCH lead:", updErr);
      return NextResponse.json({ ok: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  const { data: fresh } = await (supabase.from(table) as any).select(select).eq("id", id).maybeSingle();
  const { staffById, parentNameById } = await loadStaffMaps();
  const item = mapLeadRow((fresh ?? current) as Record<string, unknown>, category, staffById, parentNameById);
  return NextResponse.json({ ok: true, item, allowed_statuses: allowedStatusesFor(session, item.status) });
}
