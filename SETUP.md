# tylifepartners 설정 가이드

## 1. 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속

---

## 2. Supabase SQL 실행 (필수 - 제출하기 동작 전에 반드시 실행)

Supabase Dashboard → SQL Editor에서 아래 실행:

```sql
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'daangn'
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone);
```

**이미 leads 테이블이 있는 경우** (상담 상태·메모 컬럼 추가):

```sql
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT '대기';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS memo TEXT;
```

**leads 테이블 - 희망 상담일/시간/위치 컬럼 추가:**

```sql
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS desired_date TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS desired_time TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS location TEXT;
```

**tylife_b2b 테이블 (B2B 파트너 신청 - /business 페이지용):**

```sql
CREATE TABLE IF NOT EXISTS public.tylife_b2b (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'business',
  status TEXT NOT NULL DEFAULT '대기',
  memo TEXT
);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_created_at ON public.tylife_b2b (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_phone ON public.tylife_b2b (phone);
```

---

## 3. 환경변수 (.env.local / Vercel)

| 변수 | 설명 | 예시 |
|------|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key | `eyJhbG...` |
| `ADMIN_ID` | 관리자 아이디 | `admin` |
| `ADMIN_PASSWORD` | 관리자 비밀번호 | `0703` |
| `ADMIN_SESSION_SECRET` | 세션 서명용 (32자 이상) | `random-string-32-chars` |

`.env.example`을 복사해 `.env.local` 생성 후 값 입력.

---

## 4. 수정이 필요한 곳 요약

| 위치 | 내용 |
|------|------|
| `public/assets/hero.jpg` | 랜딩 메인 이미지 파일 추가 |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key |
| `ADMIN_ID` | 관리자 로그인 ID |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 |
| `ADMIN_SESSION_SECRET` | 세션 쿠키 서명용 시크릿 |
