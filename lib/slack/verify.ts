import { createHmac, timingSafeEqual } from "node:crypto";

export function getSlackSigningSecret(): string | null {
  const t = String(process.env.SLACK_SIGNING_SECRET ?? "").trim();
  return t || null;
}

export type SlackSignatureResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_headers" | "stale" | "mismatch" };

/**
 * Slack Request URL 서명 검증 (X-Slack-Signature).
 * raw body 문자열로 HMAC-SHA256 — 파싱 후 재직렬화하면 안 됨.
 */
export function verifySlackRequestSignature(opts: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  /** 테스트용 now(ms) */
  nowMs?: number;
  maxAgeSec?: number;
}): SlackSignatureResult {
  const secret = getSlackSigningSecret();
  if (!secret) return { ok: false, reason: "missing_secret" };

  const ts = String(opts.timestampHeader ?? "").trim();
  const sig = String(opts.signatureHeader ?? "").trim();
  if (!ts || !sig) return { ok: false, reason: "missing_headers" };

  const now = opts.nowMs ?? Date.now();
  const maxAge = (opts.maxAgeSec ?? 60 * 5) * 1000;
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > maxAge) {
    return { ok: false, reason: "stale" };
  }

  const base = `v0:${ts}:${opts.rawBody}`;
  const digest = createHmac("sha256", secret).update(base, "utf8").digest("hex");
  const expected = `v0=${digest}`;
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(sig, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "mismatch" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "mismatch" };
  }
}
