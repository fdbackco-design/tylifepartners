-- 자료 공유: 상품 상태 태그 (복수)
-- 적용: Supabase Dashboard → SQL Editor
-- 기존 게시글은 빈 배열로 유지

ALTER TABLE public.resource_posts
  ADD COLUMN IF NOT EXISTS status_tags TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_resource_posts_status_tags
  ON public.resource_posts USING GIN (status_tags);

COMMENT ON COLUMN public.resource_posts.status_tags IS '상품 상태 태그 (판매 가능·일시 품절 등, 복수)';
