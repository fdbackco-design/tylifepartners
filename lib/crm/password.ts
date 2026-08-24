import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
  const [, salt, hash] = parts;
  const test = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const expected = Buffer.from(hash, "hex");
  if (test.length !== expected.length) return false;
  return timingSafeEqual(test, expected);
}

/** 01012345678 → 12345678 (초기 아이디/비밀번호) */
export function credentialsFromPhone(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("010") && digits.length >= 11) return digits.slice(3, 11);
  if (digits.length >= 8) return digits.slice(-8);
  return digits;
}
