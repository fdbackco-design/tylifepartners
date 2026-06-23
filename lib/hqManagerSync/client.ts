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

/**
 * Apps Script 웹앱은 302로 googleusercontent.com 등으로 리다이렉트한다.
 * fetch 기본 follow는 POST를 GET으로 바꿔 doPost가 실행되지 않을 수 있으므로
 * POST body를 유지한 채 수동으로 리다이렉트를 따라간다.
 */
async function fetchAppsScriptPost(url: string, body: string): Promise<Response> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(currentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        return res;
      }
      currentUrl = new URL(location, currentUrl).toString();
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

  const requestBody = JSON.stringify({ ...payload, token: secret });
  const maxAttempts = options?.maxAttempts ?? MAX_ATTEMPTS;
  let lastError = "unknown error";
  let lastStatus: number | undefined;
  let lastBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchAppsScriptPost(url, requestBody);

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
