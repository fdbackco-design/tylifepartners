import nodemailer from "nodemailer";
import { formatPhoneKorean } from "@/lib/phone";

type LeadKind = "b2c" | "b2b";

type EmailLeadPayload = {
  kind: LeadKind;
  name: string;
  phone: string;
  createdAtIso?: string;
  adminUrl: string;
  // b2c
  desired_date?: string | null;
  desired_time?: string | null;
  location?: string | null;
  // b2b
  entry_page?: string | null;
  region?: string | null;
  available_time?: string | null;
  age_group?: string | null;
  job?: string | null;
  // utm
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
};

function env(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const t = v.trim();
  return t ? t : null;
}

function canSend(): boolean {
  return Boolean(env("SMTP_HOST") && env("SMTP_PORT") && env("SMTP_USER") && env("SMTP_PASS") && env("MAIL_FROM"));
}

function formatKstYmdHm(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  if (!map.year || !map.month || !map.day || !map.hour || !map.minute) return null;
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

function buildText(p: EmailLeadPayload): string {
  const lines: string[] = [];
  lines.push(`[TY Life Partners] 신규 상담 신청 (${p.kind.toUpperCase()})`);
  lines.push("");
  lines.push(`이름: ${p.name}`);
  lines.push(`연락처: ${formatPhoneKorean(p.phone)}`);
  if (p.createdAtIso) {
    const kst = formatKstYmdHm(p.createdAtIso);
    lines.push(`접수시간: ${kst ?? p.createdAtIso}`);
  }

  if (p.utm_source) {
    lines.push(`유입경로: ${p.utm_source}`);
  }

  if (p.kind === "b2c") {
    if (p.desired_date) lines.push(`희망 상담일: ${p.desired_date}`);
    if (p.desired_time) lines.push(`희망 상담시간: ${p.desired_time}`);
    if (p.location) lines.push(`사는 위치: ${p.location}`);
  } else {
    if (p.entry_page) lines.push(`유입페이지: ${p.entry_page}`);
    if (p.region) lines.push(`지역: ${p.region}`);
    if (p.available_time) lines.push(`상담가능시간: ${p.available_time}`);
    if (p.age_group) lines.push(`연령대: ${p.age_group}`);
    if (p.job) lines.push(`직업: ${p.job}`);
  }

  lines.push("");
  lines.push(`관리자 페이지: ${p.adminUrl}`);
  return lines.join("\n");
}

export async function sendLeadEmailNotification(payload: EmailLeadPayload): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!canSend()) {
    return { ok: true, skipped: true };
  }

  const host = env("SMTP_HOST")!;
  const port = parseInt(env("SMTP_PORT")!, 10);
  const secure = env("SMTP_SECURE") === "1" || env("SMTP_SECURE") === "true";
  const user = env("SMTP_USER")!;
  const pass = env("SMTP_PASS")!;
  const from = env("MAIL_FROM")!;
  const to = env("LEAD_NOTIFY_TO") || "dlsdjdmlqlc3@naver.com";

  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: { user, pass },
  });

  const subject = `[TY Life] 신규 상담 신청 (${payload.kind.toUpperCase()}) - ${payload.name}`;
  const text = buildText(payload);

  try {
    await transporter.sendMail({ from, to, subject, text });
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}

