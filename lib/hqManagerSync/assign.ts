import { randomUUID } from "crypto";
import { callHqManagerSyncWebApp } from "@/lib/hqManagerSync/client";
import { getHqSheetName, getHqSpreadsheetId, isHqManagerSyncConfigured } from "@/lib/hqManagerSync/config";
import { getHqManagerSyncEvent, upsertHqManagerSyncEvent } from "@/lib/hqManagerSync/store";
import type { HqManagerAssignResult, HqManagerSyncPayload } from "@/lib/hqManagerSync/types";

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type SyncAfterSheetAppendInput = {
  rowNumber: number;
  /** 시트1 G열에 이미 기록된 담당자명 (utm sheet_label) */
  newManagerName: string;
  customerName: string;
  phone: string;
  eventId?: string;
  spreadsheetId?: string;
  sheetName?: string;
};

/**
 * 시트1 append로 G열(담당자)이 이미 저장된 뒤 Apps Script 동기화만 수행.
 * G열 값을 되돌리지 않으며, 동기화 실패 시 DB에 재시도용 로그를 남긴다.
 */
export async function syncHqManagerAfterSheetAppend(
  input: SyncAfterSheetAppendInput
): Promise<HqManagerAssignResult> {
  const newManagerName = input.newManagerName.trim();
  const customerName = input.customerName.trim();
  const phone = digitsOnly(input.phone);
  const rowNumber = input.rowNumber;

  if (!isHqManagerSyncConfigured()) {
    console.info("[hqManagerSync] skipped — sync env not configured");
    return {
      ok: true,
      eventId: input.eventId ?? "",
      assignmentComplete: true,
      syncComplete: true,
      rowNumber,
      message: "동기화 설정 없음 (스킵)",
    };
  }

  if (!newManagerName) {
    return {
      ok: true,
      eventId: input.eventId ?? "",
      assignmentComplete: true,
      syncComplete: true,
      rowNumber,
      message: "담당자(G열) 값 없음 — 동기화 스킵",
    };
  }

  if (!customerName || phone.length < 10 || rowNumber < 2) {
    return {
      ok: false,
      eventId: input.eventId ?? "",
      assignmentComplete: true,
      syncComplete: false,
      rowNumber,
      message: "동기화에 필요한 고객 정보가 부족합니다.",
    };
  }

  const eventId = input.eventId?.trim() || randomUUID();
  const spreadsheetId = input.spreadsheetId ?? getHqSpreadsheetId();
  const sheetName = input.sheetName ?? getHqSheetName();

  const existing = await getHqManagerSyncEvent(eventId);
  if (existing?.sync_status === "success") {
    return {
      ok: true,
      eventId,
      assignmentComplete: true,
      syncComplete: true,
      rowNumber: existing.row_number,
      cached: true,
    };
  }

  const payload: HqManagerSyncPayload = {
    spreadsheetId,
    sheetName,
    rowNumber,
    newManagerName,
    customerName,
    phone,
    eventId,
  };

  if (!existing) {
    await upsertHqManagerSyncEvent({
      eventId,
      spreadsheetId,
      sheetName,
      rowNumber,
      newManagerName,
      customerName,
      phone,
      sheetUpdateStatus: "success",
      syncStatus: "pending",
      attemptCount: 0,
      lastError: null,
    });
  }

  console.info("[hqManagerSync] auto sync after sheet append", {
    eventId,
    rowNumber,
    managerName: newManagerName,
    customerName,
    phone,
    utmMappedManager: newManagerName,
  });

  const syncResult = await callHqManagerSyncWebApp(payload);

  await upsertHqManagerSyncEvent({
    eventId,
    spreadsheetId,
    sheetName,
    rowNumber,
    newManagerName,
    customerName,
    phone,
    sheetUpdateStatus: "success",
    syncStatus: syncResult.ok ? "success" : "failed",
    attemptCount: syncResult.attempts,
    lastError: syncResult.ok ? null : syncResult.error ?? "동기화 실패",
    syncedAt: syncResult.ok ? new Date().toISOString() : null,
  });

  if (!syncResult.ok) {
    console.error("[hqManagerSync] auto sync failed after utm sheet append", {
      eventId,
      rowNumber,
      managerName: newManagerName,
      error: syncResult.error,
    });
  }

  return {
    ok: true,
    eventId,
    assignmentComplete: true,
    syncComplete: syncResult.ok,
    rowNumber,
    syncError: syncResult.ok ? undefined : syncResult.error,
    message: syncResult.ok ? "담당자 시트 동기화 완료" : "담당자 시트 동기화 실패",
  };
}

/** 동기화만 재시도 (G열 저장은 유지) */
export async function retryHqManagerSync(eventId: string): Promise<HqManagerAssignResult> {
  const existing = await getHqManagerSyncEvent(eventId);
  if (!existing) {
    return {
      ok: false,
      eventId,
      assignmentComplete: false,
      syncComplete: false,
      message: "이벤트를 찾을 수 없습니다.",
    };
  }

  if (existing.sync_status === "success") {
    return {
      ok: true,
      eventId,
      assignmentComplete: true,
      syncComplete: true,
      rowNumber: existing.row_number,
      cached: true,
    };
  }

  return syncHqManagerAfterSheetAppend({
    eventId: existing.event_id,
    rowNumber: existing.row_number,
    newManagerName: existing.new_manager_name,
    customerName: existing.customer_name,
    phone: existing.phone,
    spreadsheetId: existing.spreadsheet_id,
    sheetName: existing.sheet_name,
  });
}
