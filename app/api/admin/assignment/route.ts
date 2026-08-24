import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRank } from "@/lib/adminSession";
import { ensureFixedAssignmentRules, loadAssignmentRules } from "@/lib/crm/assignment";
import { REGION_ZONE_NAMES, ZONE_BASE_LABELS } from "@/lib/crm/regionZones";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

  try {
    await ensureFixedAssignmentRules();
    const rules = await loadAssignmentRules();
    const supabase = getSupabaseAdmin();
    const { data: enabledRow } = await supabase.from("crm_settings").select("value").eq("key", "auto_assign_enabled").maybeSingle();
    const auto_assign_enabled = enabledRow?.value !== false && enabledRow?.value !== "false";
    const { data: staff } = await supabase
      .from("staff_users")
      .select("id, name, rank, region, is_active")
      .eq("is_active", true);

    return NextResponse.json({
      ok: true,
      auto_assign_enabled,
      zones: REGION_ZONE_NAMES.map((name) => ({
        name,
        bases: ZONE_BASE_LABELS[name],
      })),
      staff: staff ?? [],
      rules,
    });
  } catch (e) {
    console.error("GET assignment:", e);
    return NextResponse.json({ ok: false, message: "배정 규칙을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireRank("admin");
  if (!session) return NextResponse.json({ ok: false, message: "관리자만 변경할 수 있습니다." }, { status: 403 });

  const body = await request.json();
  const supabase = getSupabaseAdmin();

  if (body.auto_assign_enabled != null) {
    await supabase.from("crm_settings").upsert({
      key: "auto_assign_enabled",
      value: Boolean(body.auto_assign_enabled),
      updated_at: new Date().toISOString(),
    });
  }

  if (Array.isArray(body.rules)) {
    await ensureFixedAssignmentRules();
    const existing = await loadAssignmentRules();
    const byId = new Map(existing.map((r) => [r.id, r]));

    for (const rule of body.rules) {
      if (!rule?.id || !byId.has(rule.id)) continue;
      const current = byId.get(rule.id)!;
      if (!REGION_ZONE_NAMES.includes(current.region_group as (typeof REGION_ZONE_NAMES)[number])) continue;

      await supabase
        .from("assignment_rules")
        .update({ enabled: rule.enabled !== false })
        .eq("id", rule.id);

      await supabase.from("assignment_rule_members").delete().eq("rule_id", rule.id);
      const members = Array.isArray(rule.members) ? rule.members : [];
      const validMembers = members.filter((m: { staff_user_id?: string; weight?: number }) => m.staff_user_id);
      if (validMembers.length) {
        await supabase.from("assignment_rule_members").insert(
          validMembers.map((m: { staff_user_id: string; weight?: number; assigned_count?: number }) => ({
            rule_id: rule.id,
            staff_user_id: m.staff_user_id,
            weight: Math.max(1, Number(m.weight) || 1),
            assigned_count: Number(m.assigned_count) || 0,
          }))
        );
      }
    }
  }

  // 고정 권역 삭제는 허용하지 않음
  return NextResponse.json({ ok: true });
}
