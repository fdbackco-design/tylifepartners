import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRank } from "@/lib/adminSession";
import {
  ensureFixedAssignmentRules,
  loadAssignmentRules,
  normalizeKeywords,
} from "@/lib/crm/assignment";
import { REGION_ZONE_NAMES, ZONE_BASE_LABELS } from "@/lib/crm/regionZones";
import { getSupabaseAdmin } from "@/lib/supabase";

async function replaceMembers(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ruleId: string,
  members: Array<{ staff_user_id?: string; weight?: number; assigned_count?: number }>
) {
  await supabase.from("assignment_rule_members").delete().eq("rule_id", ruleId);
  const validMembers = members.filter((m) => m.staff_user_id);
  if (!validMembers.length) return;
  await supabase.from("assignment_rule_members").insert(
    validMembers.map((m) => ({
      rule_id: ruleId,
      staff_user_id: m.staff_user_id,
      weight: Math.max(1, Number(m.weight) || 1),
      assigned_count: Number(m.assigned_count) || 0,
    }))
  );
}

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
      .eq("is_active", true)
      .in("rank", ["sales", "manager"])
      .order("name");

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

  try {
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
      const usedNames = new Set(existing.map((r) => r.region_group));

      for (const rule of body.rules) {
        const name = String(rule?.region_group ?? "").trim();
        const keywords = normalizeKeywords(rule?.region_keywords);
        const members = Array.isArray(rule?.members) ? rule.members : [];
        const isNew = !rule?.id || String(rule.id).startsWith("new_");

        if (isNew) {
          if (!name) {
            return NextResponse.json({ ok: false, message: "권역 이름을 입력해 주세요." }, { status: 400 });
          }
          if (usedNames.has(name)) {
            return NextResponse.json({ ok: false, message: `"${name}" 권역이 이미 있습니다.` }, { status: 409 });
          }
          if (!keywords.length) {
            return NextResponse.json({ ok: false, message: `"${name}" 포함 지역을 하나 이상 입력해 주세요.` }, { status: 400 });
          }
          const { data: created, error } = await supabase
            .from("assignment_rules")
            .insert({
              region_group: name,
              region_keywords: keywords,
              enabled: rule.enabled !== false,
            })
            .select("id")
            .single();
          if (error || !created) {
            console.error("create assignment rule:", error);
            return NextResponse.json({ ok: false, message: "권역 추가에 실패했습니다." }, { status: 500 });
          }
          usedNames.add(name);
          await replaceMembers(supabase, created.id, members);
          continue;
        }

        if (!byId.has(rule.id)) continue;
        const current = byId.get(rule.id)!;
        const nextKeywords = keywords.length ? keywords : current.region_keywords;

        await supabase
          .from("assignment_rules")
          .update({
            enabled: rule.enabled !== false,
            region_keywords: nextKeywords,
          })
          .eq("id", rule.id);

        await replaceMembers(supabase, rule.id, members);
      }
    }

    return NextResponse.json({ ok: true, rules: await loadAssignmentRules() });
  } catch (e) {
    console.error("PUT assignment:", e);
    return NextResponse.json({ ok: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireRank("admin");
  if (!session) return NextResponse.json({ ok: false, message: "관리자만 변경할 수 있습니다." }, { status: 403 });

  try {
    const body = await request.json();
    const name = String(body?.region_group ?? "").trim();
    const keywords = normalizeKeywords(body?.region_keywords);
    if (!name) {
      return NextResponse.json({ ok: false, message: "권역 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!keywords.length) {
      return NextResponse.json({ ok: false, message: "포함 지역을 하나 이상 입력해 주세요." }, { status: 400 });
    }

    await ensureFixedAssignmentRules();
    const existing = await loadAssignmentRules();
    if (existing.some((r) => r.region_group === name)) {
      return NextResponse.json({ ok: false, message: `"${name}" 권역이 이미 있습니다.` }, { status: 409 });
    }

    const supabase = getSupabaseAdmin();
    const { data: created, error } = await supabase
      .from("assignment_rules")
      .insert({
        region_group: name,
        region_keywords: keywords,
        enabled: body.enabled !== false,
      })
      .select("id, region_group, region_keywords, enabled")
      .single();
    if (error || !created) {
      console.error("POST assignment rule:", error);
      return NextResponse.json({ ok: false, message: "권역 추가에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      rule: { ...created, members: [] },
      rules: await loadAssignmentRules(),
    });
  } catch (e) {
    console.error("POST assignment:", e);
    return NextResponse.json({ ok: false, message: "권역 추가 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireRank("admin");
  if (!session) return NextResponse.json({ ok: false, message: "관리자만 변경할 수 있습니다." }, { status: 403 });

  try {
    const id = request.nextUrl.searchParams.get("id") || "";
    if (!id) {
      return NextResponse.json({ ok: false, message: "권역 ID가 필요합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: rule, error: loadErr } = await supabase
      .from("assignment_rules")
      .select("id, region_group")
      .eq("id", id)
      .maybeSingle();
    if (loadErr || !rule) {
      return NextResponse.json({ ok: false, message: "권역을 찾을 수 없습니다." }, { status: 404 });
    }
    if (REGION_ZONE_NAMES.includes(rule.region_group as (typeof REGION_ZONE_NAMES)[number])) {
      return NextResponse.json({ ok: false, message: "기본 권역은 삭제할 수 없습니다." }, { status: 400 });
    }

    const { error } = await supabase.from("assignment_rules").delete().eq("id", id);
    if (error) {
      console.error("DELETE assignment rule:", error);
      return NextResponse.json({ ok: false, message: "권역 삭제에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rules: await loadAssignmentRules() });
  } catch (e) {
    console.error("DELETE assignment:", e);
    return NextResponse.json({ ok: false, message: "권역 삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
