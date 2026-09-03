import { NextRequest, NextResponse } from "next/server";
import {
  extractLeadgenValues,
  getMetaWebhookVerifyToken,
  ingestMetaLeadFromWebhook,
  verifyMetaWebhookSignature,
} from "@/lib/meta/leadAds";

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

  if (!expected) {
    console.error("[meta-leads] META_WEBHOOK_VERIFY_TOKEN 미설정");
    return NextResponse.json({ ok: false, message: "verify token not configured" }, { status: 503 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    console.info("[meta-leads] webhook verified");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  console.warn("[meta-leads] webhook verification failed", { mode, tokenMatch: token === expected });
  return NextResponse.json({ ok: false, message: "forbidden" }, { status: 403 });
}

/**
 * POST /api/webhooks/meta-leads
 * leadgen 이벤트 → Graph API 조회 → leads UPSERT
 * 실패 시 비-2xx로 응답해 Meta 재전송을 유도한다.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    console.error("[meta-leads] invalid signature");
    return NextResponse.json({ ok: false, message: "invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    console.error("[meta-leads] invalid JSON body");
    return NextResponse.json({ ok: false, message: "invalid json" }, { status: 400 });
  }

  const values = extractLeadgenValues(body);
  if (!values.length) {
    console.info("[meta-leads] no leadgen values in payload");
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const value of values) {
    try {
      const result = await ingestMetaLeadFromWebhook(value);
      if (!result.ok) {
        failed += 1;
        errors.push(`${value.leadgen_id}: ${result.message}`);
        console.error("[meta-leads] ingest failed:", value.leadgen_id, result.message);
        continue;
      }
      if (result.skipped === "blocked") continue;
      if (result.created) created += 1;
      else updated += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${value.leadgen_id}: ${msg}`);
      console.error("[meta-leads] ingest exception:", value.leadgen_id, msg);
    }
  }

  console.info("[meta-leads] batch done:", {
    total: values.length,
    created,
    updated,
    failed,
  });

  if (failed > 0) {
    return NextResponse.json(
      { ok: false, created, updated, failed, errors: errors.slice(0, 5) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, created, updated, processed: values.length });
}
