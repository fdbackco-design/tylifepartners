# Tylife Partners - 당근 광고 랜딩 + 관리자

당근 광고 → 랜딩 전환 최적화를 위한 모바일 랜딩 + 관리자 대시보드

## 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` 에서 확인

## 배포 (Vercel)

1. GitHub 저장소 연결
2. Vercel 프로젝트 생성
3. 환경변수 설정 (아래 참고)
4. 배포

## 환경변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (Settings → API) | ✅ |
| `ADMIN_ID` | 관리자 아이디 | ✅ |
| `ADMIN_PASSWORD` | 관리자 비밀번호 | ✅ |
| `ADMIN_SESSION_SECRET` | 세션 쿠키 서명용 시크릿 (32자 이상) | ✅ |
| `NEXT_PUBLIC_SITE_URL` | 사이트 URL (선택) | - |

## Supabase 설정

1. [Supabase](https://supabase.com) 프로젝트 생성
2. SQL Editor에서 `supabase/schema-simple.sql` 실행
3. Settings → API 에서 URL, service_role key 복사

## 수정이 필요한 곳

- **이미지**: `public/assets/hero.jpg` 파일 추가 (랜딩 메인 이미지)
- **관리자 계정**: `.env` / Vercel 환경변수에서 `ADMIN_ID`, `ADMIN_PASSWORD` 설정
- **Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 설정
