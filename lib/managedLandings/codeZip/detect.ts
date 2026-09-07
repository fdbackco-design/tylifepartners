import type { ZipFileMap } from "@/lib/managedLandings/codeZip/extract";
import { findBySuffix, listUnder } from "@/lib/managedLandings/codeZip/extract";

export type CodeZipEntries = {
  pageFile: string;
  cssFile: string;
  leadFormFile: string | null;
  assetFiles: string[];
};

export function detectCodeZipEntries(files: ZipFileMap): CodeZipEntries {
  const pageFile =
    findBySuffix(files, [
      "app/page.tsx",
      "app/page.jsx",
      "src/app/page.tsx",
      "page.tsx",
      "page.jsx",
      "App.tsx",
      "src/App.tsx",
    ]) || null;

  if (!pageFile) {
    throw new Error(
      "React 페이지를 찾지 못했습니다. app/page.tsx (또는 page.tsx)가 포함된 ZIP을 업로드해주세요."
    );
  }

  const cssFile =
    findBySuffix(files, [
      "app/globals.css",
      "app/global.css",
      "src/app/globals.css",
      "globals.css",
      "styles.css",
      "index.css",
    ]) ||
    Array.from(files.keys()).find((k) => k.endsWith(".css")) ||
    null;

  if (!cssFile) {
    throw new Error("CSS 파일을 찾지 못했습니다.");
  }

  const leadFormFile =
    findBySuffix(files, [
      "app/lead-form.tsx",
      "app/LeadForm.tsx",
      "app/lead-form.jsx",
      "lead-form.tsx",
      "LeadForm.tsx",
    ]) ||
    Array.from(files.keys()).find(
      (k) => /lead[-_]?form\.(t|j)sx$/i.test(k.split("/").pop() || "")
    ) ||
    null;

  const assetFiles = [
    ...listUnder(files, "public/assets"),
    ...listUnder(files, "assets"),
    ...listUnder(files, "public"),
  ].filter((k, i, arr) => arr.indexOf(k) === i);

  return { pageFile, cssFile, leadFormFile, assetFiles };
}
