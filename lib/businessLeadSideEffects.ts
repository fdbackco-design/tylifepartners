import { randomUUID } from "crypto";
import { sendLeadEmailNotification } from "@/lib/email";
import { appendLeadRowToGoogleSheet } from "@/lib/googleSheets";
import { syncHqManagerAfterSheetAppend } from "@/lib/hqManagerSync/assign";
import { resolveSheetMediumFromUtmSource } from "@/lib/utmSourceMapping";
import { getSiteUrl } from "@/lib/siteUrl";
import { syncLeadToCrm } from "@/lib/crmSync";

export type BusinessLeadSideEffectsInput = {
  /** tylife_b2b.id - CRM 동기화 멱등성 키. insert 실패 시 null(동기화 skip) */
  submissionId: string | null;
  dateKstYmd: string;
  name: string;
  phone: string;
  phonePretty: string;
  source: string;
  /** 동일 연락처의 과거 제출 이력이 있으면 true(이메일 제목: 재문의) */
  isRepeat: boolean;
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
    adminUrl: `${getSiteUrl()}/admin`,
    isRepeat: input.isRepeat,
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
  // /0623, /0715 → G열 공란 / /0623s, /0715s → utm sheet_label + 담당자 동기화
  const managerName =
    input.entryPage === "/0623" || input.entryPage === "/0715"
      ? ""
      : medium.trim() || null;
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

  // FEED Life CRM 동기화 - 위의 Sheets/담당자 동기화/이메일이 전부 끝난 뒤
  // 마지막 단계로만 호출한다. 실패해도 위 처리 결과는 이미 확정된 뒤이므로
  // 영향을 주지 않는다.
  if (input.submissionId) {
    await syncLeadToCrm({
      submissionId: input.submissionId,
      sourceTable: "tylife_b2b",
      customerName: input.name,
      phone: input.phone,
      region: input.region || null,
      ageGroup: input.ageGroup || null,
      occupation: input.job || null,
      inquiryType: input.jobRankForDb,
      privacyConsent: true,
      receivedAtIso: new Date().toISOString(),
      landingPage: input.entryPage,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      utmContent: input.utmContent,
    });
  }
}
