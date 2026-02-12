import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * 관리자 세션: HttpOnly 쿠키 + JWT 서명
 *
 * [바꿔야 하는 곳 - ADMIN]
 * Vercel/로컬 .env.local에 설정:
 * - ADMIN_SESSION_SECRET: JWT 서명용 시크릿 (32자 이상 랜덤 문자열)
 * - ADMIN_ID, ADMIN_PASSWORD는 app/api/admin/login/route.ts에서 사용
 */

const COOKIE_NAME = "admin_session";
// ADMIN_SESSION_SECRET이 없으면 빌드/런타임에서 에러
const getSecret = () => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ADMIN_SESSION_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
};

export async function createAdminSession(): Promise<string> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
  return token;
}

export async function verifyAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return false;

  try {
    await jwtVerify(cookie.value, getSecret());
    return true;
  } catch {
    return false;
  }
}

export function getCookieConfig(token: string) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7일
  };
}
