const DEFAULT_HQ_SPREADSHEET_ID = "1tHi28hTsRMVeQCEDiAmLFy9fe_ox8Bp82jPenWfTTqw";
const DEFAULT_HQ_SHEET_NAME = "시트1";

function env(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const t = v.trim();
  return t ? t : null;
}

export function getHqSpreadsheetId(): string {
  return env("HQ_SPREADSHEET_ID") || env("GOOGLE_SHEETS_ID") || DEFAULT_HQ_SPREADSHEET_ID;
}

export function getHqSheetName(): string {
  return env("HQ_SHEET_NAME") || env("GOOGLE_SHEETS_SHEET_NAME") || DEFAULT_HQ_SHEET_NAME;
}

export function getHqManagerSyncWebAppUrl(): string | null {
  return env("HQ_MANAGER_SYNC_WEB_APP_URL");
}

export function getHqManagerSyncSecret(): string | null {
  return env("HQ_MANAGER_SYNC_SECRET");
}

export function isHqManagerSyncConfigured(): boolean {
  return Boolean(getHqManagerSyncWebAppUrl() && getHqManagerSyncSecret());
}
