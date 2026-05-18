import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { aggregateLandingAnalytics } from "@/lib/landing-analytics/aggregate";
import {
  attachSubmissionCountsToDropout,
  fetchSubmissionCountBySection,
} from "@/lib/landing-analytics/leadSubmissionCounts";
import { LANDING_KEYS, type LandingKey } from "@/lib/landing-analytics/sections";
import type { LandingEventAggregateRow } from "@/lib/landing-analytics/eventRow";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_ROWS = 50_000;

/**
 * GET /api/admin/landing-analytics?landing_key=...&from=ISO&to=ISO
 */
export async function GET(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const landing_key = searchParams.get("landing_key") ?? "parent_main";
    if (!LANDING_KEYS.includes(landing_key as LandingKey)) {
      return NextResponse.json({ ok: false, message: "Invalid landing_key" }, { status: 400 });
    }

    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");
    const to = toParam ? new Date(toParam) : new Date();
    const from = fromParam
      ? new Date(fromParam)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ ok: false, message: "Invalid date range" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("landing_events")
      .select(
        "id, landing_key, session_id, event_type, depth, max_depth, duration_seconds, section_name, section_label, x_ratio, y_ratio, device_type, created_at"
      )
      .eq("landing_key", landing_key)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS);

    if (error) {
      console.error("landing_events fetch error:", error);
      return NextResponse.json(
        { ok: false, message: "조회 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    const events = (data ?? []) as LandingEventAggregateRow[];
    const key = landing_key as LandingKey;
    const report = aggregateLandingAnalytics(key, events);
    const submissionCounts = await fetchSubmissionCountBySection(key, from, to);
    report.section_dropout = attachSubmissionCountsToDropout(
      report.section_dropout,
      submissionCounts
    );

    return NextResponse.json({
      ok: true,
      landing_key,
      from: from.toISOString(),
      to: to.toISOString(),
      event_count: events.length,
      truncated: events.length >= MAX_ROWS,
      report,
    });
  } catch (e) {
    console.error("GET /api/admin/landing-analytics error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류" }, { status: 500 });
  }
}
