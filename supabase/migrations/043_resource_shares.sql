-- 자료 공유 (관리자 작성 · 전 직원 열람)
-- 적용: Supabase Dashboard → SQL Editor
-- Storage: public 버킷 `resource-shares` 생성 후 File size limit을 충분히 올려 주세요 (권장 200MB+).

CREATE TABLE IF NOT EXISTS public.resource_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.staff_users (id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resource_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.resource_posts (id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  -- 원본 파일명(한글 포함). Storage path는 ASCII만 사용.
  original_filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_posts_created_at ON public.resource_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_files_post_id ON public.resource_files (post_id);

COMMENT ON TABLE public.resource_posts IS '자료 공유 게시글';
COMMENT ON TABLE public.resource_files IS '자료 공유 첨부파일 (원본 한글 파일명은 original_filename)';
COMMENT ON COLUMN public.resource_files.original_filename IS '업로드 시 원본 파일명(UTF-8). 다운로드 Content-Disposition에 사용';
COMMENT ON COLUMN public.resource_files.storage_path IS 'Storage 객체 경로(ASCII only)';
