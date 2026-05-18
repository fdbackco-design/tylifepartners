import { getDeviceType } from "@/lib/landing-analytics/device";
import type { LandingKey } from "@/lib/landing-analytics/sections";
import type { LandingTrackPayload } from "@/lib/landing-analytics/types";
import { parseUTMFromUrl } from "@/lib/utm";

const SESSION_STORAGE_KEY = "tylife_landing_session_id";
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

export function getOrCreateLandingSessionId(): string {
  if (typeof window === "undefined") return randomUUID();
  try {
    const existing = localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.length >= 32) return existing;
    const id = randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, id);
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

export function buildBasePayload(landingKey: LandingKey): Omit<LandingTrackPayload, "event_type"> {
  const viewport_width = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewport_height = typeof window !== "undefined" ? window.innerHeight : 0;
  const document_height =
    typeof document !== "undefined" ? document.documentElement.scrollHeight : 0;

  return {
    landing_key: landingKey,
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
