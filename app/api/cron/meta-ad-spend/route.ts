import { NextRequest, NextResponse } from "next/server";
import { isMetaAdsConfigured } from "@/lib/meta/ads";
import { syncMetaAdDailyInsights } from "@/lib/meta/insights";

function authorizeCron(request: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  // Vercel Cron (일부 환경)
  if (request.headers.get("x-vercel-cron") === "1" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length) === secret;
  }
  return false;
}

/**
 * GET /api/cron/meta-ad-spend
 * Vercel Cron 등 — Meta 광고비 Insights 주기 동기화
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!isMetaAdsConfigured()) {
    return NextResponse.json({ ok: false, message: "META_ACCESS_TOKEN 미설정" }, { status: 503 });
  }

  const result = await syncMetaAdDailyInsights();
  return NextResponse.json(
    {
      ok: result.ok,
      insight_date: result.insight_date,
      timezone: result.timezone,
      upserted: result.upserted,
      message: result.message,
    },
    { status: result.ok ? 200 : 502 }
  );
}
