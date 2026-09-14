import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import {
  isMetaAdsConfigured,
  pickMetaAdId,
  resolveMetaCreativeVideoSourceUrl,
} from "@/lib/meta/ads";
import { isLikelyMetaObjectId } from "@/lib/utm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/meta/creative-video?ad_id=…
 * Meta CDN으로 리다이렉트하지 않고 동일 출처로 프록시 (Range 지원).
 * 브라우저 <video> 가 CDN Referer/CORS 때문에 끊기는 문제를 피한다.
 */
export async function GET(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const adId = pickMetaAdId({
    meta_ad_id: request.nextUrl.searchParams.get("ad_id"),
    utm_content: request.nextUrl.searchParams.get("utm_content"),
  });
  if (!adId || !isLikelyMetaObjectId(adId)) {
    return new NextResponse("Invalid ad_id", { status: 400 });
  }

  if (!isMetaAdsConfigured()) {
    return new NextResponse("Meta token not configured", { status: 503 });
  }

  const source = await resolveMetaCreativeVideoSourceUrl(adId);
  if (!source) {
    return new NextResponse("No video source", { status: 404 });
  }

  const range = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; FeedLifeCRM/1.0)",
    Accept: "video/mp4,video/*,*/*;q=0.8",
  };
  if (range) upstreamHeaders.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(source, {
      method: "GET",
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (e) {
    console.error("[meta/creative-video] upstream fetch failed:", e);
    return new NextResponse("Upstream video unavailable", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    console.warn("[meta/creative-video] upstream status:", upstream.status, adId);
    return new NextResponse("Upstream video unavailable", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "video/mp4");
  headers.set("Cache-Control", "private, max-age=600");
  headers.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  headers.set("X-Meta-Ad-Id", adId);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
