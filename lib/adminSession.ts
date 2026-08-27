import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@/lib/crm/types";

const COOKIE_NAME = "admin_session";

const getSecret = () => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ADMIN_SESSION_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
};

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    rank: user.rank,
    role: user.rank === "admin" ? "admin" : user.rank,
    userId: user.userId,
    name: user.name,
    loginId: user.loginId,
    region: user.region,
    parentId: user.parentId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/** 기존 ENV 관리자 세션 (하위 호환) */
export async function createAdminSession(): Promise<string> {
  const adminId = process.env.ADMIN_ID ?? "admin";
  return createSession({
    rank: "admin",
    userId: null,
    name: "관리자",
    loginId: adminId,
    region: null,
    parentId: null,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;
  try {
    const { payload } = await jwtVerify(cookie.value, getSecret());
    const rankRaw = String(payload.rank ?? payload.role ?? "");
    const userId = payload.userId ? String(payload.userId) : null;

    let rank: SessionUser["rank"];
    if (rankRaw === "admin") {
      rank = "admin";
    } else if (rankRaw === "manager") {
      rank = "manager";
    } else if (rankRaw === "sales") {
      rank = "sales";
    } else if (!userId) {
      // ENV 관리자 세션 하위 호환 (userId 없음)
      rank = "admin";
    } else {
      rank = "sales";
    }

    return {
      rank,
      userId,
      name: String(payload.name ?? (rank === "admin" ? "관리자" : "")),
      loginId: String(payload.loginId ?? ""),
      region: payload.region ? String(payload.region) : null,
      parentId: payload.parentId ? String(payload.parentId) : null,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminSession(): Promise<boolean> {
  return (await getSession()) != null;
}

export async function requireSession(): Promise<SessionUser | null> {
  return getSession();
}

export async function requireRank(...ranks: SessionUser["rank"][]): Promise<SessionUser | null> {
  const s = await getSession();
  if (!s) return null;
  if (!ranks.includes(s.rank)) return null;
  return s;
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
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function sessionCookie(token: string) {
  const config = getCookieConfig(token);
  return {
    httpOnly: config.httpOnly,
    secure: config.secure,
    sameSite: config.sameSite,
    path: config.path,
    maxAge: config.maxAge,
  };
}
