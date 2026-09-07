import JSZip from "jszip";

export type ZipFileMap = Map<string, Uint8Array>;

const MAX_FILES = 400;
const MAX_UNCOMPRESSED = 80 * 1024 * 1024;
const MAX_SINGLE = 12 * 1024 * 1024;

/** ZIP → 정규화된 상대경로 맵 (path traversal 차단) */
export async function extractZipToMap(zipBytes: ArrayBuffer | Uint8Array): Promise<ZipFileMap> {
  const zip = await JSZip.loadAsync(zipBytes);
  const out: ZipFileMap = new Map();
  let total = 0;
  let count = 0;

  const entries = Object.keys(zip.files);
  for (const rawName of entries) {
    const entry = zip.files[rawName];
    if (!entry || entry.dir) continue;

    const normalized = normalizeZipPath(rawName);
    if (!normalized) continue;

    count += 1;
    if (count > MAX_FILES) throw new Error("ZIP 파일 개수가 너무 많습니다.");

    const data = await entry.async("uint8array");
    if (data.byteLength > MAX_SINGLE) {
      throw new Error(`파일이 너무 큽니다: ${normalized}`);
    }
    total += data.byteLength;
    if (total > MAX_UNCOMPRESSED) throw new Error("ZIP 압축 해제 용량이 너무 큽니다.");

    out.set(normalized, data);
  }

  if (out.size === 0) throw new Error("ZIP에 파일이 없습니다.");
  return out;
}

function normalizeZipPath(raw: string): string | null {
  let p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  // macOS resource fork / junk
  if (p.startsWith("__MACOSX/") || p.split("/").some((s) => s.startsWith("._"))) return null;
  const parts = p.split("/").filter(Boolean);
  if (parts.some((s) => s === ".." || s === ".")) return null;
  p = parts.join("/");
  if (!p) return null;
  return p;
}

/** 단일 루트 폴더로 감싸진 ZIP이면 strip */
export function stripSingleRootFolder(files: ZipFileMap): ZipFileMap {
  const keys = Array.from(files.keys());
  if (keys.length === 0) return files;
  const firstSegs = keys.map((k) => k.split("/")[0]);
  const root = firstSegs[0];
  if (!root || !firstSegs.every((s) => s === root)) return files;
  // root가 파일이면 strip 불가
  const hasNested = keys.some((k) => k.includes("/"));
  if (!hasNested) return files;
  const next: ZipFileMap = new Map();
  for (const [k, v] of Array.from(files.entries())) {
    const stripped = k.slice(root.length + 1);
    if (stripped) next.set(stripped, v);
  }
  return next.size ? next : files;
}

export function findBySuffix(files: ZipFileMap, suffixes: string[]): string | null {
  const keys = Array.from(files.keys());
  for (const suffix of suffixes) {
    const hit = keys.find((k) => k === suffix || k.endsWith(`/${suffix}`));
    if (hit) return hit;
  }
  return null;
}

export function listUnder(files: ZipFileMap, prefix: string): string[] {
  const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return Array.from(files.keys()).filter((k) => k.startsWith(p) && !k.endsWith("/"));
}

export function decodeText(data: Uint8Array): string {
  return new TextDecoder("utf-8").decode(data);
}
