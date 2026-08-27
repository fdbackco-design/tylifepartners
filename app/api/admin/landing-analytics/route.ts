import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { aggregateLandingAnalytics } from "@/lib/landing-analytics/aggregate";
import {
  attachSubmissionCountsToDropout,
  fetchSubmissionCountByEntryPages,
  fetchSubmissionCountBySection,
} from "@/lib/landing-analytics/leadSubmissionCounts";
import {
  isValidLandingKey,
  LANDING_KEYS,
  type LandingKey,
} from "@/lib/landing-analytics/sections";
import type { LandingEventAggregateRow } from "@/lib/landing-analytics/eventRow";
import {
  getManagedLandingPathBySlug,
  getManagedLandingSectionsByKey,
} from "@/lib/managedLandings/store";
import { slugFromManagedLandingKey } from "@/lib/managedLandings/types";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_ROWS = 50_000;

/** 집계에 필요한 최소 컬럼 (user_agent 등 제외) */
const EVENT_SELECT =
  "id, landing_key, session_id, event_type, depth, max_depth, duration_seconds, section_name, section_label, x_ratio, y_ratio, device_type, viewport_width, created_at";

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
    if (!isValidLandingKey(landing_key)) {
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
    const eventsPromise = supabase
      .from("landing_events")
      .select(EVENT_SELECT)
      .eq("landing_key", landing_key)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS);

    const managedSectionsPromise = getManagedLandingSectionsByKey(landing_key);

    const submissionPromise = (async () => {
      if (LANDING_KEYS.includes(landing_key as LandingKey)) {
        return fetchSubmissionCountBySection(landing_key as LandingKey, from, to);
      }
      const slug = slugFromManagedLandingKey(landing_key);
      const path = slug ? await getManagedLandingPathBySlug(slug) : null;
      const pages = path ? [path, path.replace(/^\//, "")] : [];
      return fetchSubmissionCountByEntryPages("tylife_b2b", pages, from, to);
    })();

    const [{ data, error }, managedSections, submissionCounts] = await Promise.all([
      eventsPromise,
      managedSectionsPromise,
      submissionPromise,
    ]);

    if (error) {
      console.error("landing_events fetch error:", error);
      return NextResponse.json(
        { ok: false, message: "조회 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    const events = (data ?? []) as LandingEventAggregateRow[];
    const report = aggregateLandingAnalytics(landing_key, events, managedSections);
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
