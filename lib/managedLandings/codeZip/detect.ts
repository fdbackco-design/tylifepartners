import type { ZipFileMap } from "@/lib/managedLandings/codeZip/extract";
import { findBySuffix, listUnder } from "@/lib/managedLandings/codeZip/extract";

export type CodeZipEntries = {
  pageFile: string;
  cssFile: string;
  leadFormFile: string | null;
  assetFiles: string[];
  /** 번들에 포함할 TS/JS 소스 (ZIP 상대경로) */
  sourceFiles: string[];
};

const SOURCE_EXT = /\.(tsx|jsx|ts|js)$/i;

function isBundledSourcePath(key: string): boolean {
  if (!SOURCE_EXT.test(key)) return false;
  if (key.endsWith(".d.ts")) return false;
  const parts = key.split("/");
  if (parts.includes("node_modules")) return false;
  // app/api 등 서버 라우트 제외
  if (parts.includes("api")) return false;
  const base = parts[parts.length - 1] || "";
  if (
    /^(next\.config|vite\.config|tailwind\.config|postcss\.config|eslint\.config)/i.test(base)
  ) {
    return false;
  }
  return true;
}

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

  const sourceFiles = Array.from(files.keys())
    .filter(isBundledSourcePath)
    .sort();

  if (!sourceFiles.includes(pageFile)) sourceFiles.unshift(pageFile);

  return { pageFile, cssFile, leadFormFile, assetFiles, sourceFiles };
}
