/**
 * 이 랜딩이 실제로 서비스되는 기본 URL(프로토콜+호스트, 끝에 슬래시 없음).
 * 도메인이 바뀌어도 코드 재배포 없이 Vercel 환경변수만 바꾸면 되도록
 * 하드코딩하지 않는다. NEXT_PUBLIC_ 접두사라 브라우저(UtmLinkPanel 등)에서도
 * 동일한 값을 읽을 수 있다.
 */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.tylifepartners.com";
}
