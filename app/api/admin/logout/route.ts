import { NextResponse } from "next/server";
import { getCookieConfig } from "@/lib/adminSession";

/**
 * POST /api/admin/logout
 * 쿠키 만료 처리
 */
export async function POST() {
  const config = getCookieConfig("");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(config.name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
