-- utm_sources soft-disable
ALTER TABLE public.utm_sources
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_utm_sources_active ON public.utm_sources (is_active);
