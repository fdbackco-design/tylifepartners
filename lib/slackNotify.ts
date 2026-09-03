import { formatPhoneKorean } from "@/lib/phone";

const DEFAULT_LEAD_CHANNEL = "C0BUS09EBEY";

function slackBotToken(): string | null {
  const t = String(process.env.SLACK_BOT_TOKEN ?? "").trim();
  return t || null;
}

function slackLeadChannelId(): string {
  return String(process.env.SLACK_LEAD_CHANNEL_ID ?? DEFAULT_LEAD_CHANNEL).trim() || DEFAULT_LEAD_CHANNEL;
}

function slackWebhookUrl(): string | null {
  const t = String(process.env.SLACK_WEBHOOK_URL ?? "").trim();
  return t || null;
}

function crmAppOrigin(): string {
  const raw = String(
    process.env.WEB_PUSH_APP_ORIGIN ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      "https://www.feed-life.com"
  ).trim();
  if (!raw) return "https://www.feed-life.com";
  const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

export function isSlackLeadNotifyConfigured(): boolean {
  return Boolean(slackBotToken() || slackWebhookUrl());
}

function buildNewLeadSlackText(opts: {
  kind: "consumers" | "candidates";
  name: string;
  phone: string;
  leadId: string;
  region?: string | null;
}): { title: string; body: string; url: string; text: string } {
  const kindLabel = opts.kind === "candidates" ? "후보자" : "소비자";
  const title = `신규 ${kindLabel} DB`;
  const region = String(opts.region ?? "").trim();
  const body = `${opts.name} · ${formatPhoneKorean(opts.phone)}${region ? ` · ${region}` : ""}`;
  const path =
    opts.kind === "candidates"
      ? `/admin/candidates?search=${encodeURIComponent(opts.phone.replace(/\D/g, ""))}`
      : `/admin/consumers?search=${encodeURIComponent(opts.phone.replace(/\D/g, ""))}`;
  const url = `${crmAppOrigin()}${path}`;
  // 웹 푸시와 동일한 제목/본문 + CRM 링크
  const text = `*${title}*\n${body}\n<${url}|CRM에서 보기>`;
  return { title, body, url, text };
}

async function postSlackChatMessage(text: string): Promise<void> {
  const token = slackBotToken();
  if (!token) return;
  const channel = slackLeadChannelId();
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) {
    console.error("[slack] chat.postMessage failed:", {
      httpStatus: res.status,
      error: json.error ?? res.statusText,
      channel,
    });
  }
}

async function postSlackWebhook(text: string): Promise<void> {
  const url = slackWebhookUrl();
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[slack] webhook failed:", { httpStatus: res.status, body: body.slice(0, 200) });
  }
}

/** 신규 DB 유입 — 웹 푸시와 같은 제목/본문 형식의 슬랙 메시지 */
export async function notifySlackNewLead(opts: {
  kind: "consumers" | "candidates";
  name: string;
  phone: string;
  leadId: string;
  region?: string | null;
}): Promise<void> {
  if (!isSlackLeadNotifyConfigured()) return;
  const { text } = buildNewLeadSlackText(opts);
  try {
    if (slackBotToken()) {
      await postSlackChatMessage(text);
      return;
    }
    await postSlackWebhook(text);
  } catch (e) {
    console.error("[slack] notify failed:", e instanceof Error ? e.message : e);
  }
}
