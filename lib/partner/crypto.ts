import { createHash, randomBytes } from "crypto";

const KEY_PREFIX = "pk_live_";

export function partnerKeyPepper(): string {
  return process.env.PARTNER_API_KEY_PEPPER || process.env.ADMIN_SESSION_SECRET || "partner-dev-pepper";
}

export function hashPartnerApiKey(plaintext: string): string {
  return createHash("sha256").update(`${partnerKeyPepper()}:${plaintext}`).digest("hex");
}

export function generatePartnerApiKey(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  const prefix = plaintext.slice(0, 16);
  return { plaintext, prefix, hash: hashPartnerApiKey(plaintext) };
}

export function isPartnerApiKeyFormat(token: string): boolean {
  return token.startsWith(KEY_PREFIX) && token.length >= 32;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
