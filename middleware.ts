import { NextRequest, NextResponse } from "next/server";

const RESERVED_PREFIXES = ["/admin", "/api", "/l/", "/_next", "/assets", "/favicon"];

const RESERVED_EXACT = new Set([
  "/",
  "/business",
  "/complete",
  "/me",
  "/sidejob",
  "/no-clawback",
  "/privacy",
  "/v1",
  "/v2",
  "/v3",
  "/0623",
  "/0623s",
  "/0715",
  "/0715s",
  "/0907",
]);

/** 공개 토글 가능한 고정 코드 랜딩 */
const BUILTIN_TOGGLEABLE = new Set(["/0907"]);

let pathCache: { at: number; map: Record<string, string> } | null = null;
let builtinPublishCache: { at: number; map: Record<string, boolean> } | null = null;
const CACHE_MS = 30_000;

async function getPathMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (pathCache && now - pathCache.at < CACHE_MS) return pathCache.map;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return pathCache?.map ?? {};

  try {
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/managed_landings?select=path,slug&published=eq.true`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) return pathCache?.map ?? {};
    const rows = (await res.json()) as Array<{ path: string; slug: string }>;
    const map: Record<string, string> = {};
    for (const row of rows ?? []) {
      if (row?.path && row?.slug) map[row.path] = row.slug;
    }
    pathCache = { at: now, map };
    return map;
  } catch {
    return pathCache?.map ?? {};
  }
}

/** path → published (행 없으면 true). Edge에서 REST 직조회 */
async function getBuiltinPublishMap(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (builtinPublishCache && now - builtinPublishCache.at < CACHE_MS) {
    return builtinPublishCache.map;
  }

  const defaults: Record<string, boolean> = {};
  for (const p of Array.from(BUILTIN_TOGGLEABLE)) defaults[p] = true;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return builtinPublishCache?.map ?? defaults;

  try {
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/builtin_landing_publish?select=path,published`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) return builtinPublishCache?.map ?? defaults;
    const rows = (await res.json()) as Array<{ path: string; published: boolean }>;
    const map = { ...defaults };
    for (const row of rows ?? []) {
      if (row?.path) map[row.path] = Boolean(row.published);
    }
    builtinPublishCache = { at: now, map };
    return map;
  } catch {
    return builtinPublishCache?.map ?? defaults;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (RESERVED_EXACT.has(pathname)) {
    if (BUILTIN_TOGGLEABLE.has(pathname)) {
      const publishMap = await getBuiltinPublishMap();
      if (publishMap[pathname] === false) {
        // 관리자 세션이 있으면 미리보기용으로 통과 (페이지에서도 재검증)
        const hasAdmin = Boolean(request.cookies.get("admin_session")?.value);
        if (!hasAdmin) {
          return new NextResponse("Not Found", { status: 404 });
        }
      }
    }
    return NextResponse.next();
  }
  if (RESERVED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return NextResponse.next();

  const map = await getPathMap();
  const slug = map[pathname];
  if (!slug) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/l/${slug}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
