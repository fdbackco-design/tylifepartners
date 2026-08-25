import { getDeviceType } from "@/lib/landing-analytics/device";
import type { LandingTrackPayload } from "@/lib/landing-analytics/types";
import { parseUTMFromUrl } from "@/lib/utm";

const VISITOR_STORAGE_KEY = "tylife_landing_visitor_id";
/** 레거시: 예전에는 session_id를 localStorage에 장기 보관했음 → visitor로 이전 */
const LEGACY_SESSION_STORAGE_KEY = "tylife_landing_session_id";
const SESSION_STORAGE_KEY = "tylife_landing_visit_session_id";
const UTM_STORAGE_KEY = "tylife_utm";

function randomUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isUuidLike(value: string | null | undefined): value is string {
  return Boolean(value && value.length >= 32);
}

/** 익명 방문자 ID (브라우저 localStorage, 장기) */
export function getOrCreateLandingVisitorId(): string {
  if (typeof window === "undefined") return randomUUID();
  try {
    const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (isUuidLike(existing)) return existing;

    const legacy = localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (isUuidLike(legacy)) {
      localStorage.setItem(VISITOR_STORAGE_KEY, legacy);
      return legacy;
    }

    const id = randomUUID();
    localStorage.setItem(VISITOR_STORAGE_KEY, id);
    return id;
  } catch {
    return randomUUID();
  }
}

/**
 * 방문 세션 ID (sessionStorage — 탭/방문 단위)
 * 폼 스냅샷·이벤트·고객 연결에 사용
 */
export function getOrCreateLandingSessionId(): string {
  if (typeof window === "undefined") return randomUUID();
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (isUuidLike(existing)) return existing;
    const id = randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return randomUUID();
  }
}

function readUtm(): Pick<
  LandingTrackPayload,
  "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term"
> {
  if (typeof window === "undefined") return {};
  const fromUrl = parseUTMFromUrl(window.location.search);
  let stored: Record<string, string> = {};
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as Record<string, string>;
  } catch {
    /* ignore */
  }
  const merged = { ...stored, ...fromUrl };
  return {
    utm_source: merged.utm_source,
    utm_medium: merged.utm_medium,
    utm_campaign: merged.utm_campaign,
    utm_content: merged.utm_content,
    utm_term: merged.utm_term,
  };
}

export function buildBasePayload(landingKey: string): Omit<LandingTrackPayload, "event_type"> {
  const viewport_width = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewport_height = typeof window !== "undefined" ? window.innerHeight : 0;
  const document_height =
    typeof document !== "undefined" ? document.documentElement.scrollHeight : 0;

  return {
    landing_key: landingKey,
    visitor_id: getOrCreateLandingVisitorId(),
    session_id: getOrCreateLandingSessionId(),
    page_url: typeof window !== "undefined" ? window.location.href.slice(0, 500) : undefined,
    referrer: typeof document !== "undefined" ? document.referrer?.slice(0, 500) : undefined,
    ...readUtm(),
    viewport_width,
    viewport_height,
    document_height,
    device_type: getDeviceType(viewport_width),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : undefined,
  };
}

const TRACK_URL = "/api/landing-analytics/track";

export function sendLandingEvent(
  payload: LandingTrackPayload,
  options?: { beacon?: boolean }
): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify(payload);

  if (options?.beacon && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(TRACK_URL, blob)) return;
  }

  fetch(TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    /* MVP: silent fail */
  });
}

/** 상담 신청 성공 직후 — 세션에 신청 시점 마커 */
export function trackLeadSubmitEvent(landingKey: string): void {
  sendLandingEvent({
    ...buildBasePayload(landingKey),
    event_type: "lead_submit",
    max_depth: undefined,
  });
}
