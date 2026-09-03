import { NextRequest, NextResponse } from "next/server";
import {
  extractLeadgenValues,
  getMetaWebhookVerifyToken,
  ingestMetaLeadFromWebhook,
  verifyMetaWebhookSignature,
} from "@/lib/meta/leadAds";
import { runAfterResponse } from "@/lib/runAfterResponse";

/**
 * GET /api/webhooks/meta-leads
 * Meta Webhook 구독 검증 (hub.challenge)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  const expected = getMetaWebhookVerifyToken();

  console.info("[meta-leads][verify] GET hit", {
    mode,
    hasChallenge: Boolean(challenge),
    tokenConfigured: Boolean(expected),
    tokenMatch: Boolean(expected && token === expected),
  });

  if (!expected) {
    console.error("[meta-leads][verify] META_WEBHOOK_VERIFY_TOKEN 미설정");
    return NextResponse.json({ ok: false, message: "verify token not configured" }, { status: 503 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    console.info("[meta-leads][verify] ok — returning challenge");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  console.warn("[meta-leads][verify] failed", { mode, tokenMatch: token === expected });
  return NextResponse.json({ ok: false, message: "forbidden" }, { status: 403 });
}

/**
 * POST /api/webhooks/meta-leads
 * 1) 원본 raw body로 서명 검증
 * 2) 즉시 HTTP 200 ACK (Meta Testing Tool Pending 방지)
 * 3) Graph 조회 + Supabase UPSERT는 백그라운드 처리 + 단계별 로그
 */
export async function POST(request: NextRequest) {
  const receivedAt = Date.now();
  // Next.js App Router: request.text() = 원본 raw body (재 stringify 금지)
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  console.info("[meta-leads][http] POST reached", {
    rawBodyBytes: Buffer.byteLength(rawBody, "utf8"),
    hasSignature: Boolean(signature),
    contentType: request.headers.get("content-type"),
    userAgent: request.headers.get("user-agent"),
  });

  const sig = verifyMetaWebhookSignature(rawBody, signature);
  if (!sig.ok) {
    console.error("[meta-leads][signature] rejected — returning 401", { reason: sig.reason });
    return NextResponse.json(
      { ok: false, message: "invalid signature", reason: sig.reason },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    console.error("[meta-leads][parse] invalid JSON — raw body was used only for signature, parse failed");
    // Meta에는 ACK하되 처리 불가 로그. Testing Tool이 Pending 되지 않도록 200.
    return NextResponse.json({ ok: true, accepted: 0, warning: "invalid json" });
  }

  const values = extractLeadgenValues(body);
  console.info("[meta-leads][http] extracted leadgen count:", values.length, {
    ackMs: Date.now() - receivedAt,
  });

  if (!values.length) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  // Meta는 빠른 200을 요구 — ingest는 waitUntil/백그라운드로 수행
  runAfterResponse(
    (async () => {
      let created = 0;
      let updated = 0;
      let failed = 0;
      for (const value of values) {
        try {
          const result = await ingestMetaLeadFromWebhook(value);
          if (!result.ok) {
            failed += 1;
            console.error("[meta-leads][ingest] failed:", {
              leadgen_id: value.leadgen_id,
              stage: result.stage ?? "unknown",
              message: result.message,
              status: result.status ?? null,
            });
            continue;
          }
          if (result.skipped === "blocked") continue;
          if (result.created) created += 1;
          else updated += 1;
        } catch (e) {
          failed += 1;
          console.error("[meta-leads][ingest] exception:", {
            leadgen_id: value.leadgen_id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      console.info("[meta-leads][ingest] batch done:", {
        total: values.length,
        created,
        updated,
        failed,
      });
    })()
  );

  // 서명 OK + payload 수신 확인 후 즉시 200
  return NextResponse.json({
    ok: true,
    accepted: values.length,
    ack_ms: Date.now() - receivedAt,
  });
}
