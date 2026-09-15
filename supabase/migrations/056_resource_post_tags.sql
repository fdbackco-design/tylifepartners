-- 자료 공유: 상품 태그 · 영업 상황 태그 (복수)
-- 적용: Supabase Dashboard → SQL Editor
-- 기존 게시글은 빈 배열로 유지되어 목록/열람에 영향 없음

ALTER TABLE public.resource_posts
  ADD COLUMN IF NOT EXISTS product_tags TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.resource_posts
  ADD COLUMN IF NOT EXISTS situation_tags TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_resource_posts_product_tags
  ON public.resource_posts USING GIN (product_tags);

CREATE INDEX IF NOT EXISTS idx_resource_posts_situation_tags
  ON public.resource_posts USING GIN (situation_tags);

COMMENT ON COLUMN public.resource_posts.product_tags IS '상품 태그 (복수)';
COMMENT ON COLUMN public.resource_posts.situation_tags IS '영업 상황 태그 (복수)';
