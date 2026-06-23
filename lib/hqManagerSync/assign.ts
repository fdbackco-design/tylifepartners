import { randomUUID } from "crypto";
import {
  findMainSheetRowByPhone,
  updateMainSheetManagerColumn,
} from "@/lib/googleSheets";
import { callHqManagerSyncWebApp } from "@/lib/hqManagerSync/client";
import { getHqSheetName, getHqSpreadsheetId } from "@/lib/hqManagerSync/config";
import { getHqManagerSyncEvent, upsertHqManagerSyncEvent } from "@/lib/hqManagerSync/store";
import type { HqManagerAssignResult, HqManagerSyncPayload } from "@/lib/hqManagerSync/types";

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type AssignHqManagerInput = {
  newManagerName: string;
  customerName: string;
  phone: string;
  rowNumber?: number;
  eventId?: string;
};

async function resolveRowNumber(
  spreadsheetId: string,
  sheetName: string,
  phone: string,
  rowNumber?: number
): Promise<number | null> {
  if (rowNumber != null && rowNumber >= 2) return rowNumber;
  return findMainSheetRowByPhone(spreadsheetId, sheetName, phone);
}

export async function assignHqManagerAndSync(
  input: AssignHqManagerInput
): Promise<HqManagerAssignResult> {
  const newManagerName = input.newManagerName.trim();
  const customerName = input.customerName.trim();
  const phone = digitsOnly(input.phone);

  if (!newManagerName) {
    return {
      ok: false,
      eventId: input.eventId ?? "",
      assignmentComplete: false,
      syncComplete: false,
      message: "담당자 이름을 입력해 주세요.",
    };
  }
  if (!customerName) {
    return {
      ok: false,
      eventId: input.eventId ?? "",
      assignmentComplete: false,
      syncComplete: false,
      message: "고객 이름이 필요합니다.",
    };
  }
  if (phone.length < 10) {
    return {
      ok: false,
      eventId: input.eventId ?? "",
      assignmentComplete: false,
      syncComplete: false,
      message: "유효한 연락처가 필요합니다.",
    };
  }

  const eventId = input.eventId?.trim() || randomUUID();
  const spreadsheetId = getHqSpreadsheetId();
  const sheetName = getHqSheetName();

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

  let rowNumber = existing?.row_number ?? input.rowNumber;
  if (!rowNumber || rowNumber < 2) {
    const found = await resolveRowNumber(spreadsheetId, sheetName, phone, rowNumber);
    if (!found) {
      return {
        ok: false,
        eventId,
        assignmentComplete: false,
        syncComplete: false,
        message: "시트에서 해당 연락처 행을 찾을 수 없습니다.",
      };
    }
    rowNumber = found;
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

  const sheetAlreadyUpdated = existing?.sheet_update_status === "success";

  if (!sheetAlreadyUpdated) {
    const sheetResult = await updateMainSheetManagerColumn(
      spreadsheetId,
      sheetName,
      rowNumber,
      newManagerName
    );

    if (!sheetResult.ok) {
      await upsertHqManagerSyncEvent({
        eventId,
        spreadsheetId,
        sheetName,
        rowNumber,
        newManagerName,
        customerName,
        phone,
        sheetUpdateStatus: "failed",
        syncStatus: "pending",
        lastError: sheetResult.error ?? "G열 저장 실패",
      });

      console.error("[hqManagerSync] sheet G column update failed", {
        eventId,
        rowNumber,
        managerName: newManagerName,
        error: sheetResult.error,
      });

      return {
        ok: false,
        eventId,
        assignmentComplete: false,
        syncComplete: false,
        rowNumber,
        message: sheetResult.error ?? "담당자(G열) 저장에 실패했습니다.",
      };
    }

    console.info("[hqManagerSync] sheet G column updated", {
      eventId,
      spreadsheetId,
      sheetName,
      rowNumber,
      managerName: newManagerName,
      customerName,
      phone,
    });

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

  return {
    ok: true,
    eventId,
    assignmentComplete: true,
    syncComplete: syncResult.ok,
    rowNumber,
    syncError: syncResult.ok ? undefined : syncResult.error,
    message: syncResult.ok
      ? "담당자 배정 완료"
      : "담당자 배정 완료 · 담당자 시트 동기화 실패",
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

  if (existing.sheet_update_status !== "success") {
    return assignHqManagerAndSync({
      eventId,
      newManagerName: existing.new_manager_name,
      customerName: existing.customer_name,
      phone: existing.phone,
      rowNumber: existing.row_number,
    });
  }

  const payload: HqManagerSyncPayload = {
    spreadsheetId: existing.spreadsheet_id,
    sheetName: existing.sheet_name,
    rowNumber: existing.row_number,
    newManagerName: existing.new_manager_name,
    customerName: existing.customer_name,
    phone: existing.phone,
    eventId: existing.event_id,
  };

  const syncResult = await callHqManagerSyncWebApp(payload);

  await upsertHqManagerSyncEvent({
    eventId: existing.event_id,
    spreadsheetId: existing.spreadsheet_id,
    sheetName: existing.sheet_name,
    rowNumber: existing.row_number,
    newManagerName: existing.new_manager_name,
    customerName: existing.customer_name,
    phone: existing.phone,
    sheetUpdateStatus: "success",
    syncStatus: syncResult.ok ? "success" : "failed",
    attemptCount: existing.attempt_count + syncResult.attempts,
    lastError: syncResult.ok ? null : syncResult.error ?? "동기화 실패",
    syncedAt: syncResult.ok ? new Date().toISOString() : null,
  });

  return {
    ok: true,
    eventId: existing.event_id,
    assignmentComplete: true,
    syncComplete: syncResult.ok,
    rowNumber: existing.row_number,
    syncError: syncResult.ok ? undefined : syncResult.error,
    message: syncResult.ok
      ? "담당자 시트 동기화 완료"
      : "담당자 시트 동기화 실패",
  };
}
