import { getSupabaseAdmin } from "@/lib/supabase";

export const RESOURCE_SHARES_BUCKET = "resource-shares";
/** 서명 업로드는 서버를 거치지 않음. Supabase 버킷 file size limit도 맞춰 주세요. */
export const RESOURCE_MAX_BYTES = 50 * 1024 * 1024;

export const RESOURCE_PRODUCT_TAGS = ["크루즈", "올라이프", "가전", "기타 상품"] as const;
export type ResourceProductTag = (typeof RESOURCE_PRODUCT_TAGS)[number];

export const RESOURCE_STATUS_TAGS = [
  "판매 가능",
  "일시 품절",
  "판매 종료",
  "대체 상품 있음",
  "신규 제품",
  "프로모션 진행 중",
] as const;
export type ResourceStatusTag = (typeof RESOURCE_STATUS_TAGS)[number];

export const RESOURCE_SITUATION_TAGS = [
  "여행 경험으로 접근할 때",
  "가격으로 접근할 때",
  "혜택으로 접근할 때",
  "가전제품으로 접근할 때",
  "상품 경쟁력으로 접근할 때",
  "고객이 망설일 때",
  "배우자와 상의한다고 할 때",
] as const;
export type ResourceSituationTag = (typeof RESOURCE_SITUATION_TAGS)[number];

const PRODUCT_SET = new Set<string>(RESOURCE_PRODUCT_TAGS);
const STATUS_SET = new Set<string>(RESOURCE_STATUS_TAGS);
const SITUATION_SET = new Set<string>(RESOURCE_SITUATION_TAGS);

export type ResourceFileRow = {
  id: string;
  post_id: string;
  storage_path: string;
  public_url: string | null;
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
};

export type ResourcePostRow = {
  id: string;
  title: string;
  body: string;
  product_tags: string[];
  status_tags: string[];
  situation_tags: string[];
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  files: ResourceFileRow[];
};

const POST_SELECT =
  "id, title, body, product_tags, status_tags, situation_tags, created_by, created_by_name, created_at, updated_at";

/** Storage 경로용 ASCII 확장자 — 한글·특수문자 제거 */
export function safeStorageExt(filename: string): string {
  const ext = (filename.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

/** 표시/다운로드용 원본 파일명 정리 (경로 구분자만 제거, 한글 유지) */
export function sanitizeOriginalFilename(filename: string): string {
  const base = String(filename ?? "")
    .replace(/[/\\]/g, "_")
    .replace(/\0/g, "")
    .trim();
  if (!base) return `file.${safeStorageExt(filename)}`;
  return base.replace(/[<>:"|?*\u0000-\u001f]/g, "_").slice(0, 180);
}

export function buildResourceStoragePath(originalFilename: string): string {
  const ext = safeStorageExt(originalFilename);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `posts/${stamp}-${rand}.${ext}`;
}

/** RFC 5987 — Windows/Chrome에서 한글 파일명 다운로드용 */
export function contentDispositionAttachment(originalFilename: string): string {
  const name = sanitizeOriginalFilename(originalFilename);
  const asciiFallback =
    name
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "download.bin";
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeProductTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (PRODUCT_SET.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

export function normalizeStatusTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (STATUS_SET.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

export function normalizeSituationTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (SITUATION_SET.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function asTagArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  return [];
}

function mapPostRow(p: Record<string, unknown>, files: ResourceFileRow[]): ResourcePostRow {
  return {
    id: String(p.id),
    title: String(p.title ?? ""),
    body: String(p.body ?? ""),
    product_tags: asTagArray(p.product_tags),
    status_tags: asTagArray(p.status_tags),
    situation_tags: asTagArray(p.situation_tags),
    created_by: p.created_by != null ? String(p.created_by) : null,
    created_by_name: p.created_by_name != null ? String(p.created_by_name) : null,
    created_at: String(p.created_at ?? ""),
    updated_at: String(p.updated_at ?? ""),
    files,
  };
}

type FileInput = {
  storage_path: string;
  public_url?: string | null;
  original_filename: string;
  content_type?: string | null;
  size_bytes: number;
};

async function insertFiles(postId: string, files: FileInput[]): Promise<ResourceFileRow[]> {
  if (!files.length) return [];
  const supabase = getSupabaseAdmin();
  const payload = files.map((f) => ({
    post_id: postId,
    storage_path: f.storage_path,
    public_url: f.public_url ?? null,
    original_filename: sanitizeOriginalFilename(f.original_filename),
    content_type: f.content_type || null,
    size_bytes: Math.max(0, Math.floor(f.size_bytes)),
  }));
  const { data: inserted, error: fileErr } = await supabase
    .from("resource_files")
    .insert(payload)
    .select("id, post_id, storage_path, public_url, original_filename, content_type, size_bytes, created_at");
  if (fileErr) throw new Error(fileErr.message);
  return (inserted ?? []) as ResourceFileRow[];
}

async function loadFilesForPosts(postIds: string[]): Promise<Map<string, ResourceFileRow[]>> {
  const byPost = new Map<string, ResourceFileRow[]>();
  if (!postIds.length) return byPost;
  const supabase = getSupabaseAdmin();
  const { data: files, error: fileErr } = await supabase
    .from("resource_files")
    .select("id, post_id, storage_path, public_url, original_filename, content_type, size_bytes, created_at")
    .in("post_id", postIds)
    .order("created_at", { ascending: true });
  if (fileErr) throw new Error(fileErr.message);
  for (const f of files ?? []) {
    const row = f as ResourceFileRow;
    const list = byPost.get(row.post_id) ?? [];
    list.push(row);
    byPost.set(row.post_id, list);
  }
  return byPost;
}

export async function listResourcePosts(): Promise<ResourcePostRow[]> {
  const supabase = getSupabaseAdmin();
  const { data: posts, error } = await supabase
    .from("resource_posts")
    .select(POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = (posts ?? []) as Record<string, unknown>[];
  const ids = rows.map((p) => String(p.id));
  if (!ids.length) return [];

  const byPost = await loadFilesForPosts(ids);
  return rows.map((p) => mapPostRow(p, byPost.get(String(p.id)) ?? []));
}

export async function getResourcePost(id: string): Promise<ResourcePostRow | null> {
  const supabase = getSupabaseAdmin();
  const { data: post, error } = await supabase.from("resource_posts").select(POST_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) return null;
  const byPost = await loadFilesForPosts([id]);
  return mapPostRow(post as Record<string, unknown>, byPost.get(id) ?? []);
}

export async function createResourcePost(input: {
  title: string;
  body: string;
  productTags?: string[];
  statusTags?: string[];
  situationTags?: string[];
  createdBy: string | null;
  createdByName: string | null;
  files: FileInput[];
}): Promise<ResourcePostRow> {
  const supabase = getSupabaseAdmin();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("제목을 입력해주세요.");
  if (title.length > 200) throw new Error("제목은 200자 이내로 입력해주세요.");
  if (body.length > 20000) throw new Error("내용은 20,000자 이내로 입력해주세요.");

  const productTags = normalizeProductTags(input.productTags);
  const statusTags = normalizeStatusTags(input.statusTags);
  const situationTags = normalizeSituationTags(input.situationTags);

  const { data: post, error } = await supabase
    .from("resource_posts")
    .insert({
      title,
      body,
      product_tags: productTags,
      status_tags: statusTags,
      situation_tags: situationTags,
      created_by: input.createdBy,
      created_by_name: input.createdByName,
      updated_at: new Date().toISOString(),
    })
    .select(POST_SELECT)
    .single();
  if (error || !post) throw new Error(error?.message || "게시글 저장 실패");

  const fileRows = await insertFiles(String(post.id), input.files);
  return mapPostRow(post as Record<string, unknown>, fileRows);
}

export async function updateResourcePost(
  id: string,
  input: {
    title: string;
    body: string;
    productTags?: string[];
    statusTags?: string[];
    situationTags?: string[];
    filesToAdd?: FileInput[];
  }
): Promise<ResourcePostRow> {
  const supabase = getSupabaseAdmin();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("제목을 입력해주세요.");
  if (title.length > 200) throw new Error("제목은 200자 이내로 입력해주세요.");
  if (body.length > 20000) throw new Error("내용은 20,000자 이내로 입력해주세요.");

  const productTags = normalizeProductTags(input.productTags);
  const statusTags = normalizeStatusTags(input.statusTags);
  const situationTags = normalizeSituationTags(input.situationTags);

  const { data: post, error } = await supabase
    .from("resource_posts")
    .update({
      title,
      body,
      product_tags: productTags,
      status_tags: statusTags,
      situation_tags: situationTags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(POST_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) throw new Error("게시글을 찾을 수 없습니다.");

  const added = await insertFiles(id, input.filesToAdd ?? []);
  const byPost = await loadFilesForPosts([id]);
  const files = byPost.get(id) ?? added;
  return mapPostRow(post as Record<string, unknown>, files);
}

export async function deleteResourcePost(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: files } = await supabase.from("resource_files").select("storage_path").eq("post_id", id);

  const { error } = await supabase.from("resource_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from(RESOURCE_SHARES_BUCKET).remove(paths);
    if (rmErr) {
      console.warn("[resourceShares] storage cleanup:", rmErr.message);
    }
  }
}

export async function getResourceFile(fileId: string): Promise<ResourceFileRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("resource_files")
    .select("id, post_id, storage_path, public_url, original_filename, content_type, size_bytes, created_at")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ResourceFileRow) ?? null;
}

/** 등록 후 NEW 표시 (KST 기준 7일) */
export function isResourcePostNew(createdAtIso: string, now = new Date()): boolean {
  const t = Date.parse(createdAtIso);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < 7 * 24 * 60 * 60 * 1000;
}

export function resourceBodyPreview(body: string, maxLen = 72): string {
  const oneLine = String(body ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!oneLine) return "";
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}
