export const LANDING_0623_ENTRY_PAGES = new Set(["/0623", "/0623s"]);

export function isLanding0623EntryPage(entryPage: string | null | undefined): boolean {
  if (!entryPage) return false;
  const normalized = entryPage.startsWith("/") ? entryPage : `/${entryPage}`;
  return LANDING_0623_ENTRY_PAGES.has(normalized);
}

export function normalizeLanding0623EntryPage(entryPage: string): string {
  const trimmed = entryPage.trim();
  if (trimmed === "0623" || trimmed === "/0623") return "/0623";
  if (trimmed === "0623s" || trimmed === "/0623s") return "/0623s";
  return trimmed;
}
