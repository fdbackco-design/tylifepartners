-- UTM source 관리 (관리자 링크 생성 + 구글 시트 C/G 매핑)
CREATE TABLE IF NOT EXISTS utm_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sheet_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utm_sources_value ON utm_sources (value);

-- 기본 플랫폼 (기존 UTM 플랫폼과 동일)
INSERT INTO utm_sources (value, label, sheet_label) VALUES
  ('youtube', '유튜브', '유튜브'),
  ('naver_shorts', '네이버 숏츠', '네이버 숏츠'),
  ('instagram', '인스타그램', '인스타그램'),
  ('tiktok', '틱톡', '틱톡'),
  ('kakao_openchat', '카카오톡 오픈채팅방', '카카오톡 오픈채팅방'),
  ('daangn', '당근마켓', '당근마켓'),
  ('threads', '스레드', '스레드'),
  ('facebook', '페이스북', '페이스북'),
  ('naver_blog', '네이버 블로그', '네이버 블로그'),
  ('band', '밴드', '밴드')
ON CONFLICT (value) DO NOTHING;
