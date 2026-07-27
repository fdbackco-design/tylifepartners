import { NextRequest, NextResponse } from "next/server";

const RESERVED_PREFIXES = ["/admin", "/api", "/l/", "/_next", "/assets", "/favicon"];

const RESERVED_EXACT = new Set([
  "/",
  "/business",
  "/complete",
  "/me",
  "/sidejob",
  "/no-clawback",
  "/v1",
  "/v2",
  "/v3",
  "/0623",
  "/0623s",
  "/0715",
  "/0715s",
]);

let cache: { at: number; map: Record<string, string> } | null = null;
const CACHE_MS = 30_000;

async function getPathMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.map;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return cache?.map ?? {};

  try {
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/managed_landings?select=path,slug&published=eq.true`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) return cache?.map ?? {};
    const rows = (await res.json()) as Array<{ path: string; slug: string }>;
    const map: Record<string, string> = {};
    for (const row of rows ?? []) {
      if (row?.path && row?.slug) map[row.path] = row.slug;
    }
    cache = { at: now, map };
    return map;
  } catch {
    return cache?.map ?? {};
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (RESERVED_EXACT.has(pathname)) return NextResponse.next();
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
