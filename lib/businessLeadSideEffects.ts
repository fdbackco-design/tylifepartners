import { randomUUID } from "crypto";
import { sendLeadEmailNotification } from "@/lib/email";
import { appendLeadRowToGoogleSheet } from "@/lib/googleSheets";
import { syncHqManagerAfterSheetAppend } from "@/lib/hqManagerSync/assign";
import { resolveSheetMediumFromUtmSource } from "@/lib/utmSourceMapping";

export type BusinessLeadSideEffectsInput = {
  dateKstYmd: string;
  name: string;
  phone: string;
  phonePretty: string;
  source: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  entryPage: string;
  region: string;
  availableTime: string;
  ageGroup: string;
  job: string;
  jobRankForDb: string | null;
};

/**
 * DB 저장 성공 후 백그라운드: 구글 시트 → 담당자 동기화, 이메일(병렬).
 */
export async function processBusinessLeadSideEffects(
  input: BusinessLeadSideEffectsInput
): Promise<void> {
  const emailPromise = sendLeadEmailNotification({
    kind: "b2b",
    name: input.name,
    phone: input.phone,
    createdAtIso: new Date().toISOString(),
    adminUrl: "https://www.tylifepartners.com/admin",
    entry_page: input.entryPage,
    region: input.region || null,
    available_time: input.availableTime || null,
    age_group: input.ageGroup || null,
    job: input.job || null,
    job_rank: input.jobRankForDb,
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    utm_content: input.utmContent,
  }).then((emailResult) => {
    if (!emailResult.ok && !emailResult.skipped) {
      console.error("Business lead email notify failed:", emailResult.error);
    }
  });

  const medium = await resolveSheetMediumFromUtmSource(input.utmSource, input.source);
  const managerName = medium.trim() || null;
  const sheetResult = await appendLeadRowToGoogleSheet({
    dateKstYmd: input.dateKstYmd,
    medium,
    managerName,
    kind: "B2B",
    name: input.name,
    phone: input.phonePretty,
    entry_page: input.entryPage,
    region: input.region || null,
    available_time: input.availableTime || null,
    age_group: input.ageGroup || null,
    job: input.job || null,
    job_rank: input.jobRankForDb,
  });

  if (!sheetResult.ok && !sheetResult.skipped) {
    console.error("Google Sheets append failed:", sheetResult.error);
  } else if (
    sheetResult.ok &&
    sheetResult.targetRow &&
    managerName &&
    !sheetResult.skipped
  ) {
    const syncResult = await syncHqManagerAfterSheetAppend({
      rowNumber: sheetResult.targetRow,
      newManagerName: managerName,
      customerName: input.name,
      phone: input.phonePretty,
      eventId: randomUUID(),
      spreadsheetId: sheetResult.spreadsheetId,
      sheetName: sheetResult.sheetName,
    });
    if (!syncResult.syncComplete) {
      console.error("[hqManagerSync] post-append sync failed", {
        eventId: syncResult.eventId,
        rowNumber: sheetResult.targetRow,
        managerName,
        error: syncResult.syncError,
      });
    }
  }

  await emailPromise;
}
