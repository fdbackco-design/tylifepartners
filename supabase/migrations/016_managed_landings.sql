-- 관리자가 생성하는 동적 랜딩페이지
CREATE TABLE IF NOT EXISTS public.managed_landings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- URL 경로 (예: /promo-a). 유일. 선행 슬래시 포함.
  path TEXT NOT NULL UNIQUE,
  -- 공개 슬러그 (/l/[slug] 및 analytics key). path에서 유도 가능하나 명시 저장.
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '상담 안내',
  -- 선택: 커스텀 호스트 (예: promo.example.com). null이면 기본 도메인 + path
  custom_host TEXT,
  hero1_url TEXT NOT NULL DEFAULT '',
  hero2_url TEXT NOT NULL DEFAULT '',
  show_brochure BOOLEAN NOT NULL DEFAULT false,
  brochure_url TEXT,
  -- always | from_bottom | after_bottom
  cta_position TEXT NOT NULL DEFAULT 'from_bottom'
    CHECK (cta_position IN ('always', 'from_bottom', 'after_bottom')),
  -- [{ name, label, start, end }]
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_landings_path ON public.managed_landings (path);
CREATE INDEX IF NOT EXISTS idx_managed_landings_slug ON public.managed_landings (slug);
CREATE INDEX IF NOT EXISTS idx_managed_landings_published ON public.managed_landings (published);

COMMENT ON TABLE public.managed_landings IS '관리자 생성 랜딩 (/admin/landings)';
COMMENT ON COLUMN public.managed_landings.cta_position IS 'always=전체, from_bottom=하단이미지 시작부터, after_bottom=하단이미지 이후';

-- 상담 신청에 랜딩 식별자 저장
ALTER TABLE public.tylife_b2b
  ADD COLUMN IF NOT EXISTS landing_id UUID REFERENCES public.managed_landings(id) ON DELETE SET NULL;

ALTER TABLE public.tylife_b2b
  ADD COLUMN IF NOT EXISTS landing_path TEXT;

CREATE INDEX IF NOT EXISTS idx_tylife_b2b_landing_id ON public.tylife_b2b (landing_id);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_landing_path ON public.tylife_b2b (landing_path);
