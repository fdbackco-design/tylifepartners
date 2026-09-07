import { detectCodeZipEntries } from "@/lib/managedLandings/codeZip/detect";
import {
  decodeText,
  extractZipToMap,
  stripSingleRootFolder,
} from "@/lib/managedLandings/codeZip/extract";
import { bundleLandingCode } from "@/lib/managedLandings/codeZip/bundle";
import {
  injectAnalyticsSectionAttrs,
  injectLeadFormCrmBridge,
  rewriteAssetPaths,
  rewriteNextImports,
} from "@/lib/managedLandings/codeZip/transform";
import {
  createManagedLanding,
  getManagedLandingByPath,
  isReservedLandingPath,
  updateManagedLanding,
} from "@/lib/managedLandings/store";
import {
  normalizeLandingPath,
  sectionsFromMarkers,
  slugFromPath,
  type ManagedLandingRow,
} from "@/lib/managedLandings/types";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "landing-assets";

export type PublishCodeZipInput = {
  zipBytes: ArrayBuffer | Uint8Array;
  path: string;
  title?: string;
  published?: boolean;
  sourceZipName?: string;
  /** 기존 랜딩 덮어쓰기 */
  replaceId?: string | null;
};

export type PublishCodeZipResult = {
  landing: ManagedLandingRow;
  warnings: string[];
};

function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    woff: "font/woff",
    woff2: "font/woff2",
  };
  return map[ext] || "application/octet-stream";
}

async function uploadBytes(
  storagePath: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Storage 업로드 실패 (${storagePath}): ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function publishCodeZip(input: PublishCodeZipInput): Promise<PublishCodeZipResult> {
  const path = normalizeLandingPath(input.path);
  if (!path || path === "/") throw new Error("배포 경로를 입력해주세요.");
  if (isReservedLandingPath(path)) {
    throw new Error("예약된 경로입니다. 다른 경로를 사용해주세요.");
  }

  const slug = slugFromPath(path);
  const existing = await getManagedLandingByPath(path);
  if (existing && existing.id !== input.replaceId) {
    throw new Error("이미 사용 중인 경로입니다.");
  }

  let files = stripSingleRootFolder(await extractZipToMap(input.zipBytes));
  const entries = detectCodeZipEntries(files);

  const stamp = Date.now();
  const assetBasePath = `code/${slug}/${stamp}/assets`;
  const uploadedNames = new Set<string>();

  for (const assetKey of entries.assetFiles) {
    const data = files.get(assetKey);
    if (!data) continue;
    // public/assets/foo.webp → foo.webp ; assets/foo → foo ; public/x → x
    let name = assetKey;
    if (name.startsWith("public/assets/")) name = name.slice("public/assets/".length);
    else if (name.startsWith("assets/")) name = name.slice("assets/".length);
    else if (name.startsWith("public/")) name = name.slice("public/".length);
    if (!name || name.endsWith(".css") || name.endsWith(".tsx") || name.endsWith(".ts")) continue;
    uploadedNames.add(name);
    await uploadBytes(`${assetBasePath}/${name}`, data, contentTypeFor(name));
  }

  const supabase = getSupabaseAdmin();
  const { data: placeholderPublic } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(`${assetBasePath}/.keep`);
  const assetBaseUrl = placeholderPublic.publicUrl.replace(/\/\.keep$/, "/");

  let pageCode = decodeText(files.get(entries.pageFile)!);
  pageCode = rewriteNextImports(pageCode);
  pageCode = rewriteAssetPaths(pageCode, assetBaseUrl, uploadedNames);
  const injected = injectAnalyticsSectionAttrs(pageCode);
  pageCode = injected.code;

  const sourceFiles: Record<string, string> = {};
  for (const rel of entries.sourceFiles) {
    const raw = files.get(rel);
    if (!raw) continue;
    let code = decodeText(raw);
    code = rewriteNextImports(code);
    code = rewriteAssetPaths(code, assetBaseUrl, uploadedNames);
    sourceFiles[rel] = code;
  }
  // 주입된 페이지·리드폼으로 덮어쓰기
  sourceFiles[entries.pageFile] = pageCode;

  if (entries.leadFormFile) {
    let leadFormCode = sourceFiles[entries.leadFormFile] ?? decodeText(files.get(entries.leadFormFile)!);
    leadFormCode = rewriteNextImports(leadFormCode);
    leadFormCode = rewriteAssetPaths(leadFormCode, assetBaseUrl, uploadedNames);
    leadFormCode = injectLeadFormCrmBridge(leadFormCode, {
      entryPage: path,
      landingIdPlaceholder: "__LANDING_ID__",
    });
    sourceFiles[entries.leadFormFile] = leadFormCode;
  }

  let cssCode = decodeText(files.get(entries.cssFile)!);
  cssCode = rewriteAssetPaths(cssCode, assetBaseUrl, uploadedNames);
  // Scope loosely: keep as-is; runtime wraps .landing-code
  // Strip tailwind import if present
  cssCode = cssCode.replace(/@import\s+["']tailwindcss["'];?\s*/g, "");

  const bundled = await bundleLandingCode({
    pageFile: entries.pageFile,
    sourceFiles,
  });

  const bundleUrl = await uploadBytes(
    `code/${slug}/${stamp}/bundle.js`,
    new TextEncoder().encode(bundled.js),
    "application/javascript; charset=utf-8"
  );
  const cssUrl = await uploadBytes(
    `code/${slug}/${stamp}/styles.css`,
    new TextEncoder().encode(cssCode),
    "text/css; charset=utf-8"
  );

  const sections = sectionsFromMarkers(injected.markers);
  const codeMeta = {
    source_zip: input.sourceZipName || "upload.zip",
    page_file: entries.pageFile,
    css_file: entries.cssFile,
    lead_form_file: entries.leadFormFile,
    asset_count: uploadedNames.size,
    section_count: injected.markers.length,
    bundled_at: new Date().toISOString(),
  };

  const payload = {
    path,
    title: (input.title ?? "상담 안내").trim() || "상담 안내",
    published: Boolean(input.published),
    kind: "code" as const,
    hero1_url: "",
    hero2_url: "",
    show_brochure: false,
    brochure_url: null,
    sections,
    code_bundle_url: bundleUrl,
    code_css_url: cssUrl,
    code_asset_base: assetBaseUrl,
    code_meta: codeMeta,
  };

  let landing: ManagedLandingRow;
  if (input.replaceId || existing?.kind === "code") {
    const id = input.replaceId || existing!.id;
    landing = await updateManagedLanding(id, payload);
  } else {
    landing = await createManagedLanding(payload);
  }

  return { landing, warnings: bundled.warnings };
}
