const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
const SKIP_NAME = /logo|icon|favicon|sprite|avatar|emoji/i;

/** ZIP 페이지 소스에서 등장 순 이미지 에셋 파일명 추출 (로고/아이콘 제외) */
export function extractOrderedImageAssetNames(source: string): string[] {
  const re = /\/assets\/([A-Za-z0-9._\-\/]+\.(?:png|jpe?g|webp|gif|avif))/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const name = m[1];
    if (!name || seen.has(name) || SKIP_NAME.test(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function isCodeLandingPreviewImageName(name: string): boolean {
  const base = name.split("/").pop() || name;
  return IMAGE_EXT.test(base) && !SKIP_NAME.test(base);
}

/** assetBase + 파일명 → 공개 URL 목록 (페이지 순 우선, 없으면 업로드 목록) */
export function buildCodeLandingPreviewImages(opts: {
  assetBaseUrl: string;
  pageSource: string;
  uploadedNames: Iterable<string>;
}): string[] {
  const base = opts.assetBaseUrl.endsWith("/") ? opts.assetBaseUrl : `${opts.assetBaseUrl}/`;
  const uploaded = new Set(
    Array.from(opts.uploadedNames).map((n) => n.replace(/^\//, ""))
  );
  const ordered = extractOrderedImageAssetNames(opts.pageSource).filter((n) => uploaded.has(n));
  const rest = Array.from(uploaded)
    .filter((n) => isCodeLandingPreviewImageName(n) && !ordered.includes(n))
    .sort();
  return [...ordered, ...rest].map((n) => `${base}${n}`);
}
