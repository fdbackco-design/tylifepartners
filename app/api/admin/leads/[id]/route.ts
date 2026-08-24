import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { appendStatusMemo } from "@/lib/crm/memo";
import { CANDIDATE_SELECT, CONSUMER_SELECT, loadStaffMaps, mapLeadRow } from "@/lib/crm/mapLead";
import { canChangeAssignee, visibleAssigneeIds } from "@/lib/crm/scope";
import { allowedStatusesFor, isLeadStatus, normalizeStatus, tableForCategory } from "@/lib/crm/status";
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

  if (body.assignee_id !== undefined) {
    if (!canChangeAssignee(session)) {
      return NextResponse.json({ ok: false, message: "담당자를 변경할 권한이 없습니다." }, { status: 403 });
    }
    const nextAssignee = body.assignee_id ? String(body.assignee_id) : null;
    if (nextAssignee !== curAssignee) {
      const { staffById } = await loadStaffMaps();
      await supabase.from("lead_memo_logs").insert({
        lead_table: table,
        lead_id: id,
        assignee_id: curAssignee,
        assignee_name: curAssignee ? staffById.get(curAssignee)?.name ?? "" : "",
        memo: nextMemo,
      });
      await supabase.from("lead_assignment_logs").insert({
        lead_table: table,
        lead_id: id,
        from_assignee_id: curAssignee,
        to_assignee_id: nextAssignee,
        assigned_at: nowIso,
        changed_by: session.userId,
        changed_by_name: session.name,
        reason: "manual",
      });
      patch.assignee_id = nextAssignee;
      patch.assigned_at = nowIso;
      if (nextStatus === "배정전" && nextAssignee) {
        nextMemo = appendStatusMemo(nextMemo, "대기", now);
        nextStatus = "대기";
        patch.status = "대기";
        patch.status_changed_at = nowIso;
        patch.memo = nextMemo;
        await supabase.from("lead_status_logs").insert({
          lead_table: table,
          lead_id: id,
          from_status: currentStatus,
          to_status: "대기",
          assignee_id: nextAssignee,
          changed_at: nowIso,
          changed_by_name: session.name,
        });
      }
    }
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
      await supabase.from("lead_status_logs").insert({
        lead_table: table,
        lead_id: id,
        from_status: nextStatus,
        to_status: requested,
        assignee_id: (patch.assignee_id as string | null | undefined) ?? curAssignee,
        changed_at: nowIso,
        changed_by_name: session.name,
      });
      nextStatus = requested;
    }
  }

  if (body.memo != null && body.status == null) {
    if (nextStatus === "대기") {
      return NextResponse.json({ ok: false, message: "대기 상태에서는 메모를 수정할 수 없습니다." }, { status: 400 });
    }
    patch.memo = String(body.memo);
  }

  if (body.meeting_at !== undefined) {
    if (nextStatus !== "대면확정" && body.meeting_at) {
      return NextResponse.json({ ok: false, message: "대면확정 상태에서만 일정을 지정할 수 있습니다." }, { status: 400 });
    }
    patch.meeting_at = body.meeting_at ? String(body.meeting_at) : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, message: "수정할 내용이 없습니다." }, { status: 400 });
  }

  const { error: updErr } = await supabase.from(table).update(patch).eq("id", id);
  if (updErr) {
    console.error("PATCH lead:", updErr);
    return NextResponse.json({ ok: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }

  const { data: fresh } = await (supabase.from(table) as any).select(select).eq("id", id).maybeSingle();
  const { staffById, parentNameById } = await loadStaffMaps();
  const item = mapLeadRow((fresh ?? current) as Record<string, unknown>, category, staffById, parentNameById);
  return NextResponse.json({ ok: true, item, allowed_statuses: allowedStatusesFor(session, item.status) });
}
