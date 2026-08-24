import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRank } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: enabledRow } = await supabase.from("crm_settings").select("value").eq("key", "auto_assign_enabled").maybeSingle();
  const auto_assign_enabled = enabledRow?.value !== false && enabledRow?.value !== "false";

  const { data: rules, error } = await supabase
    .from("assignment_rules")
    .select("id, region_group, region_keywords, enabled")
    .order("region_group");
  if (error) {
    console.error("assignment_rules:", error);
    return NextResponse.json({ ok: false, message: "배정 규칙을 불러오지 못했습니다." }, { status: 500 });
  }
  const ids = (rules ?? []).map((r) => r.id);
  const { data: members } = ids.length
    ? await supabase.from("assignment_rule_members").select("id, rule_id, staff_user_id, weight, assigned_count").in("rule_id", ids)
    : { data: [] as { id: string; rule_id: string; staff_user_id: string; weight: number; assigned_count: number }[] };
  const { data: staff } = await supabase.from("staff_users").select("id, name, rank, region, is_active").eq("is_active", true);

  const byRule = new Map<string, typeof members>();
  for (const m of members ?? []) {
    const list = byRule.get(m.rule_id) ?? [];
    list.push(m);
    byRule.set(m.rule_id, list);
  }

  return NextResponse.json({
    ok: true,
    auto_assign_enabled,
    staff: staff ?? [],
    rules: (rules ?? []).map((r) => ({
      ...r,
      members: byRule.get(r.id) ?? [],
    })),
  });
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
    for (const rule of body.rules) {
      if (rule.id) {
        await supabase
          .from("assignment_rules")
          .update({
            region_group: String(rule.region_group ?? "").trim(),
            region_keywords: Array.isArray(rule.region_keywords) ? rule.region_keywords : [],
            enabled: rule.enabled !== false,
          })
          .eq("id", rule.id);
        await supabase.from("assignment_rule_members").delete().eq("rule_id", rule.id);
        const members = Array.isArray(rule.members) ? rule.members : [];
        if (members.length) {
          await supabase.from("assignment_rule_members").insert(
            members
              .filter((m: { staff_user_id?: string }) => m.staff_user_id)
              .map((m: { staff_user_id: string; weight?: number; assigned_count?: number }) => ({
                rule_id: rule.id,
                staff_user_id: m.staff_user_id,
                weight: Math.max(1, Number(m.weight) || 1),
                assigned_count: Number(m.assigned_count) || 0,
              }))
          );
        }
      } else if (String(rule.region_group ?? "").trim()) {
        const { data: created } = await supabase
          .from("assignment_rules")
          .insert({
            region_group: String(rule.region_group).trim(),
            region_keywords: Array.isArray(rule.region_keywords) ? rule.region_keywords : [],
            enabled: rule.enabled !== false,
          })
          .select("id")
          .single();
        if (created && Array.isArray(rule.members) && rule.members.length) {
          await supabase.from("assignment_rule_members").insert(
            rule.members
              .filter((m: { staff_user_id?: string }) => m.staff_user_id)
              .map((m: { staff_user_id: string; weight?: number }) => ({
                rule_id: created.id,
                staff_user_id: m.staff_user_id,
                weight: Math.max(1, Number(m.weight) || 1),
                assigned_count: 0,
              }))
          );
        }
      }
    }
  }

  if (body.delete_rule_id) {
    await supabase.from("assignment_rules").delete().eq("id", String(body.delete_rule_id));
  }

  return NextResponse.json({ ok: true });
}
