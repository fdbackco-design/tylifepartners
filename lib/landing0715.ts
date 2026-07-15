export const LANDING_0715_ENTRY_PAGES = new Set(["/0715", "/0715s"]);

export function isLanding0715EntryPage(entryPage: string | null | undefined): boolean {
  if (!entryPage) return false;
  const normalized = entryPage.startsWith("/") ? entryPage : `/${entryPage}`;
  return LANDING_0715_ENTRY_PAGES.has(normalized);
}

export function normalizeLanding0715EntryPage(entryPage: string): string {
  const trimmed = entryPage.trim();
  if (trimmed === "0715" || trimmed === "/0715") return "/0715";
  if (trimmed === "0715s" || trimmed === "/0715s") return "/0715s";
  return trimmed;
}
