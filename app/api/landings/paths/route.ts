import { NextResponse } from "next/server";
import { listPublishedLandingPathMap } from "@/lib/managedLandings/store";

/**
 * GET /api/landings/paths
 * 공개 미들웨어용 path→slug 맵 (캐시 가능)
 */
export async function GET() {
  try {
    const map = await listPublishedLandingPathMap();
    return NextResponse.json(
      { ok: true, map },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("GET /api/landings/paths:", msg);
    return NextResponse.json({ ok: false, map: {} }, { status: 500 });
  }
}
