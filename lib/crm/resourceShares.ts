import { getSupabaseAdmin } from "@/lib/supabase";

export const RESOURCE_SHARES_BUCKET = "resource-shares";
/** 서명 업로드는 서버를 거치지 않음. Supabase 버킷 file size limit도 맞춰 주세요. */
export const RESOURCE_MAX_BYTES = 50 * 1024 * 1024;

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
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  files: ResourceFileRow[];
};

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
  // Windows 예약/제어문자
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

export async function listResourcePosts(): Promise<ResourcePostRow[]> {
  const supabase = getSupabaseAdmin();
  const { data: posts, error } = await supabase
    .from("resource_posts")
    .select("id, title, body, created_by, created_by_name, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const ids = (posts ?? []).map((p) => p.id);
  if (!ids.length) return [];

  const { data: files, error: fileErr } = await supabase
    .from("resource_files")
    .select("id, post_id, storage_path, public_url, original_filename, content_type, size_bytes, created_at")
    .in("post_id", ids)
    .order("created_at", { ascending: true });
  if (fileErr) throw new Error(fileErr.message);

  const byPost = new Map<string, ResourceFileRow[]>();
  for (const f of files ?? []) {
    const row = f as ResourceFileRow;
    const list = byPost.get(row.post_id) ?? [];
    list.push(row);
    byPost.set(row.post_id, list);
  }

  return (posts ?? []).map((p) => ({
    ...(p as Omit<ResourcePostRow, "files">),
    files: byPost.get(p.id) ?? [],
  }));
}

export async function createResourcePost(input: {
  title: string;
  body: string;
  createdBy: string | null;
  createdByName: string | null;
  files: Array<{
    storage_path: string;
    public_url?: string | null;
    original_filename: string;
    content_type?: string | null;
    size_bytes: number;
  }>;
}): Promise<ResourcePostRow> {
  const supabase = getSupabaseAdmin();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("제목을 입력해주세요.");
  if (title.length > 200) throw new Error("제목은 200자 이내로 입력해주세요.");
  if (body.length > 20000) throw new Error("내용은 20,000자 이내로 입력해주세요.");

  const { data: post, error } = await supabase
    .from("resource_posts")
    .insert({
      title,
      body,
      created_by: input.createdBy,
      created_by_name: input.createdByName,
      updated_at: new Date().toISOString(),
    })
    .select("id, title, body, created_by, created_by_name, created_at, updated_at")
    .single();
  if (error || !post) throw new Error(error?.message || "게시글 저장 실패");

  const fileRows: ResourceFileRow[] = [];
  if (input.files.length) {
    const payload = input.files.map((f) => ({
      post_id: post.id,
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
    fileRows.push(...((inserted ?? []) as ResourceFileRow[]));
  }

  return { ...(post as Omit<ResourcePostRow, "files">), files: fileRows };
}

export async function deleteResourcePost(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: files } = await supabase
    .from("resource_files")
    .select("storage_path")
    .eq("post_id", id);

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
