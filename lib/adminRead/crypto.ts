import { createHash, randomBytes } from "crypto";
import { extractBearerToken, partnerKeyPepper } from "@/lib/partner/crypto";

export const ADMIN_READ_KEY_PREFIX = "ak_live_";

export function hashAdminReadApiKey(plaintext: string): string {
  return createHash("sha256").update(`${partnerKeyPepper()}:admin-read:${plaintext}`).digest("hex");
}

export function generateAdminReadApiKey(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `${ADMIN_READ_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  const prefix = plaintext.slice(0, 16);
  return { plaintext, prefix, hash: hashAdminReadApiKey(plaintext) };
}

export function isAdminReadApiKeyFormat(token: string): boolean {
  return token.startsWith(ADMIN_READ_KEY_PREFIX) && token.length >= 32;
}

export function isPartnerApiKeyFormat(token: string): boolean {
  return token.startsWith("pk_live_") && token.length >= 32;
}

export { extractBearerToken };
