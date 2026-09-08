import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import {
  fetchAndCacheMetaAdCreative,
  isMetaAdsConfigured,
  pickMetaAdId,
  resolveMetaAdCreative,
} from "@/lib/meta/ads";
import { isLikelyMetaObjectId } from "@/lib/utm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchUpstreamImage(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: {
        // 일부 CDN이 빈 UA를 거절함
        "User-Agent": "Mozilla/5.0 (compatible; FeedLifeCRM/1.0)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const ct = String(res.headers.get("content-type") ?? "");
    if (ct && !ct.startsWith("image/") && !ct.includes("octet-stream")) {
      // HTML 오류 페이지 등
      return null;
    }
    return res;
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/meta/creative-image?ad_id=…
 * Meta CDN 서명 URL 만료와 무관하게 관리자 목록에 이미지를 안정적으로 표시.
 * 캐시 URL이 깨지면 Marketing API로 재발급 후 한 번 더 시도한다.
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

  let creative = await resolveMetaAdCreative(adId);
  let url = creative.image_url || creative.thumbnail_url;

  if (!url) {
    creative = await fetchAndCacheMetaAdCreative(adId);
    url = creative.image_url || creative.thumbnail_url;
  }
  if (!url) {
    return new NextResponse("No creative image", { status: 404 });
  }

  let upstream = await fetchUpstreamImage(url);
  if (!upstream) {
    creative = await fetchAndCacheMetaAdCreative(adId);
    url = creative.image_url || creative.thumbnail_url;
    if (!url) {
      return new NextResponse("No creative image", { status: 404 });
    }
    upstream = await fetchUpstreamImage(url);
  }
  if (!upstream) {
    return new NextResponse("Upstream image unavailable", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=1800",
      "X-Meta-Ad-Id": adId,
    },
  });
}
