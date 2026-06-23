import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isLandingAnalyticsIpExcluded } from "@/lib/landingAnalyticsIpExclude";
import { parseTrackBody, toDbRow } from "@/lib/landing-analytics/validate";
import { getClientIp } from "@/lib/requestClientIp";

/**
 * POST /api/landing-analytics/track
 * 공개 랜딩 분석 이벤트 수집 (비인증, 허용 필드만 저장)
 * sendBeacon(application/json) 지원
 */
export async function POST(request: NextRequest) {
  try {
    let raw: unknown;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      raw = await request.json();
    } else {
      const text = await request.text();
      if (!text) {
        return NextResponse.json({ ok: false, message: "Empty body" }, { status: 400 });
      }
      raw = JSON.parse(text);
    }

    const parsed = parseTrackBody(raw);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
    }

    const clientIp = getClientIp(request);
    if (isLandingAnalyticsIpExcluded(clientIp)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("landing_events").insert(toDbRow(parsed.data));

    if (error) {
      console.error("landing_events insert error:", error);
      return NextResponse.json({ ok: false, message: "Save failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/landing-analytics/track error:", e);
    return NextResponse.json({ ok: false, message: "Server error" }, { status: 500 });
  }
}
