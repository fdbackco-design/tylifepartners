import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatPhoneKorean } from "@/lib/phone";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function configureVapid(): boolean {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "").trim();
  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:admin@feed-life.com").trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(
    String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim() &&
      String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "").trim()
  );
}

export function getVapidPublicKey(): string | null {
  const k = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  return k || null;
}

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function pushAppOrigin(): string {
  const raw = String(
    process.env.WEB_PUSH_APP_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      "https://www.feed-life.com"
  )
    .trim()
    .replace(/\/$/, "");
  if (!raw) return "https://www.feed-life.com";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function toAbsoluteAppUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || "/admin/consumers").trim() || "/admin/consumers";
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${pushAppOrigin()}${path}`;
}

async function sendToSubscriptions(subs: SubRow[], payload: PushPayload): Promise<void> {
  if (!subs.length) return;
  if (!configureVapid()) {
    console.warn("[webPush] VAPID 미설정 — 알림 스킵");
    return;
  }

  const navigate = toAbsoluteAppUrl(payload.url || "/admin/consumers");
  const tag = payload.tag || "tylife-crm";

  // Declarative Web Push (iOS 홈화면 웹앱): 알림 탭 시 JS 없이도 navigate URL로 이동
  // 구형 SW/브라우저는 동일 JSON을 push 이벤트로 받아 showNotification 처리
  const body = JSON.stringify({
    web_push: 8030,
    notification: {
      title: payload.title,
      body: payload.body,
      navigate,
      tag,
      lang: "ko",
      dir: "ltr",
      silent: false,
    },
    // 레거시 SW 호환 필드
    title: payload.title,
    body: payload.body,
    url: navigate,
    tag,
  });

  const supabase = getSupabaseAdmin();
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 }
        );
      } catch (e: unknown) {
        const statusCode =
          e && typeof e === "object" && "statusCode" in e
            ? Number((e as { statusCode?: number }).statusCode)
            : 0;
        // 만료·미구독 구독 정리
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("web_push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.warn(
            "[webPush] send failed:",
            e instanceof Error ? e.message : e
          );
        }
      }
    })
  );
}

async function loadSubsByStaffIds(staffIds: string[]): Promise<SubRow[]> {
  if (!staffIds.length) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("staff_user_id", staffIds);
  if (error) {
    if (/web_push_subscriptions|schema cache/i.test(error.message)) return [];
    console.warn("[webPush] load by staff:", error.message);
    return [];
  }
  return (data ?? []) as SubRow[];
}

async function loadAdminSubscriptions(): Promise<SubRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("rank", "admin");
  if (error) {
    if (/web_push_subscriptions|schema cache/i.test(error.message)) return [];
    console.warn("[webPush] load admins:", error.message);
    return [];
  }
  return (data ?? []) as SubRow[];
}

/** 신규 상담 DB → 관리자(rank=admin) 전원 */
export async function notifyAdminsNewLead(opts: {
  kind: "consumers" | "candidates";
  name: string;
  phone: string;
  leadId: string;
  region?: string | null;
}): Promise<void> {
  if (!isWebPushConfigured()) return;
  const subs = await loadAdminSubscriptions();
  if (!subs.length) return;

  const kindLabel = opts.kind === "candidates" ? "후보자" : "소비자";
  const url =
    opts.kind === "candidates"
      ? `/admin/candidates?search=${encodeURIComponent(opts.phone.replace(/\D/g, ""))}`
      : `/admin/consumers?search=${encodeURIComponent(opts.phone.replace(/\D/g, ""))}`;
  const region = String(opts.region ?? "").trim();

  await sendToSubscriptions(subs, {
    title: `신규 ${kindLabel} DB`,
    body: `${opts.name} · ${formatPhoneKorean(opts.phone)}${region ? ` · ${region}` : ""}`,
    url,
    tag: `new-lead-${opts.leadId}`,
  });
}

/** 담당자 지정/변경 → 해당 담당자 */
export async function notifyAssigneeAssigned(opts: {
  assigneeId: string;
  kind: "consumers" | "candidates";
  name: string;
  phone: string;
  leadId: string;
}): Promise<void> {
  if (!isWebPushConfigured()) return;
  const subs = await loadSubsByStaffIds([opts.assigneeId]);
  if (!subs.length) return;

  const kindLabel = opts.kind === "candidates" ? "후보자" : "소비자";
  const url =
    opts.kind === "candidates"
      ? `/admin/candidates?search=${encodeURIComponent(opts.phone.replace(/\D/g, ""))}`
      : `/admin/consumers?search=${encodeURIComponent(opts.phone.replace(/\D/g, ""))}`;

  await sendToSubscriptions(subs, {
    title: "새 담당 고객이 배정되었습니다",
    body: `${kindLabel} · ${opts.name} · ${formatPhoneKorean(opts.phone)}`,
    url,
    tag: `assign-${opts.leadId}`,
  });
}

/** 관리자/매니저 코멘트 작성 후 담당자에게 1회 알림 */
export async function notifyAssigneeAdminComment(opts: {
  assigneeId: string;
  kind: "consumers" | "candidates";
  name: string;
  phone: string;
  leadId: string;
  authorName: string;
}): Promise<void> {
  if (!isWebPushConfigured()) return;
  const subs = await loadSubsByStaffIds([opts.assigneeId]);
  if (!subs.length) return;

  const kindLabel = opts.kind === "candidates" ? "후보자" : "소비자";
  const base =
    opts.kind === "candidates"
      ? `/admin/candidates?open_comment=${encodeURIComponent(opts.leadId)}`
      : `/admin/consumers?open_comment=${encodeURIComponent(opts.leadId)}`;
  const url = `${base}&search=${encodeURIComponent(opts.phone.replace(/\D/g, ""))}`;

  await sendToSubscriptions(subs, {
    title: "담당 고객에 코멘트가 등록되었습니다",
    body: `${kindLabel} · ${opts.name} · ${opts.authorName}`,
    url,
    tag: `admin-comment-${opts.leadId}`,
  });
}
