import type { HqManagerSyncPayload } from "@/lib/hqManagerSync/types";
import { getHqManagerSyncSecret, getHqManagerSyncWebAppUrl } from "@/lib/hqManagerSync/config";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

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

  const maxAttempts = options?.maxAttempts ?? MAX_ATTEMPTS;
  let lastError = "unknown error";
  let lastStatus: number | undefined;
  let lastBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": secret,
        },
        body: JSON.stringify(payload),
      });

      lastStatus = res.status;
      lastBody = await res.text();

      if (res.ok) {
        console.info("[hqManagerSync] sync success", {
          eventId: payload.eventId,
          rowNumber: payload.rowNumber,
          managerName: payload.newManagerName,
          attempt,
          statusCode: res.status,
        });
        return { ok: true, attempts: attempt, statusCode: res.status, responseBody: lastBody };
      }

      lastError = `HTTP ${res.status}: ${lastBody.slice(0, 500)}`;
      console.warn("[hqManagerSync] sync attempt failed", {
        eventId: payload.eventId,
        rowNumber: payload.rowNumber,
        managerName: payload.newManagerName,
        attempt,
        statusCode: res.status,
        body: lastBody.slice(0, 200),
      });
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
  });

  return {
    ok: false,
    attempts: maxAttempts,
    error: lastError,
    statusCode: lastStatus,
    responseBody: lastBody,
  };
}
