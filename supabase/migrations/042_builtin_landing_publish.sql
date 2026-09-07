-- 고정(코드) 랜딩 공개 여부
CREATE TABLE IF NOT EXISTS public.builtin_landing_publish (
  path TEXT PRIMARY KEY,
  published BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.builtin_landing_publish IS 'app/ 고정 라우트 랜딩의 공개/비공개 상태';

INSERT INTO public.builtin_landing_publish (path, published)
VALUES ('/0907', true)
ON CONFLICT (path) DO NOTHING;
