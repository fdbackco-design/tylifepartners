import type { HqManagerSyncPayload } from "@/lib/hqManagerSync/types";
import { getHqManagerSyncSecret, getHqManagerSyncWebAppUrl } from "@/lib/hqManagerSync/config";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const MAX_REDIRECTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type HqManagerSyncCallResult = {
  ok: boolean;
  attempts: number;
  error?: string;
  statusCode?: number;
  responseBody?: string;
};

type AppsScriptResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  duplicated?: boolean;
};

function appendTokenToUrl(baseUrl: string, token: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("token", token);
  return u.toString();
}

/**
 * Apps Script 웹앱 POST 흐름:
 * 1) script.google.com …/exec 에 POST → doPost 실행
 * 2) 302 → googleusercontent.com (응답 수신용 URL)
 * 3) 리다이렉트 URL은 GET만 허용 — POST로 따라가면 405 Page Not Found
 */
async function fetchAppsScriptPost(url: string, body: string): Promise<Response> {
  let currentUrl = url;
  let method: "POST" | "GET" = "POST";

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(currentUrl, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? body : undefined,
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        return res;
      }
      currentUrl = new URL(location, currentUrl).toString();
      method = "GET";
      continue;
    }

    return res;
  }

  throw new Error("Apps Script redirect hop limit exceeded");
}

function parseAppsScriptResponse(body: string): {
  ok: boolean;
  error?: string;
  data?: AppsScriptResponse;
} {
  const trimmed = body.trim();

  if (!trimmed) {
    return { ok: false, error: "Apps Script 응답이 비어 있습니다." };
  }

  if (trimmed.startsWith("<")) {
    return {
      ok: false,
      error: `HTML 응답 수신 (doPost 미실행 가능): ${trimmed.slice(0, 200)}`,
    };
  }

  try {
    const data = JSON.parse(trimmed) as AppsScriptResponse;
    if (data.ok === true) {
      return { ok: true, data };
    }
    const detail = data.message || data.error || JSON.stringify(data);
    return { ok: false, error: detail, data };
  } catch {
    return {
      ok: false,
      error: `JSON 파싱 실패: ${trimmed.slice(0, 300)}`,
    };
  }
}

export async function callHqManagerSyncWebApp(
  payload: HqManagerSyncPayload,
  options?: { maxAttempts?: number }
): Promise<HqManagerSyncCallResult> {
  const url = getHqManagerSyncWebAppUrl();
  const secret = getHqManagerSyncSecret();

  if (!url || !secret) {
    return {
      ok: false,
      attempts: 0,
      error: "HQ_MANAGER_SYNC_WEB_APP_URL 또는 HQ_MANAGER_SYNC_SECRET 미설정",
    };
  }

  if (url.includes("/dev")) {
    return {
      ok: false,
      attempts: 0,
      error: "HQ_MANAGER_SYNC_WEB_APP_URL은 /exec 배포 URL이어야 합니다 (/dev 아님)",
    };
  }

  const requestBody = JSON.stringify({ ...payload, token: secret });
  const requestUrl = appendTokenToUrl(url, secret);
  const maxAttempts = options?.maxAttempts ?? MAX_ATTEMPTS;
  let lastError = "unknown error";
  let lastStatus: number | undefined;
  let lastBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchAppsScriptPost(requestUrl, requestBody);

      lastStatus = res.status;
      lastBody = await res.text();

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${lastBody.slice(0, 500)}`;
        console.warn("[hqManagerSync] sync attempt failed", {
          eventId: payload.eventId,
          rowNumber: payload.rowNumber,
          managerName: payload.newManagerName,
          attempt,
          statusCode: res.status,
          body: lastBody.slice(0, 200),
        });
      } else {
        const parsed = parseAppsScriptResponse(lastBody);
        if (parsed.ok) {
          console.info("[hqManagerSync] sync success", {
            eventId: payload.eventId,
            rowNumber: payload.rowNumber,
            managerName: payload.newManagerName,
            attempt,
            statusCode: res.status,
            duplicated: parsed.data?.duplicated ?? false,
            response: lastBody.slice(0, 500),
          });
          return { ok: true, attempts: attempt, statusCode: res.status, responseBody: lastBody };
        }

        lastError = parsed.error ?? "Apps Script ok=false";
        console.warn("[hqManagerSync] sync rejected by Apps Script", {
          eventId: payload.eventId,
          rowNumber: payload.rowNumber,
          managerName: payload.newManagerName,
          attempt,
          statusCode: res.status,
          error: lastError,
          body: lastBody.slice(0, 500),
        });
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn("[hqManagerSync] sync attempt error", {
        eventId: payload.eventId,
        rowNumber: payload.rowNumber,
        managerName: payload.newManagerName,
        attempt,
        error: lastError,
      });
    }

    if (attempt < maxAttempts) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }

  console.error("[hqManagerSync] sync exhausted retries", {
    eventId: payload.eventId,
    rowNumber: payload.rowNumber,
    managerName: payload.newManagerName,
    attempts: maxAttempts,
    error: lastError,
    statusCode: lastStatus,
    body: lastBody.slice(0, 500),
  });

  return {
    ok: false,
    attempts: maxAttempts,
    error: lastError,
    statusCode: lastStatus,
    responseBody: lastBody,
  };
}
