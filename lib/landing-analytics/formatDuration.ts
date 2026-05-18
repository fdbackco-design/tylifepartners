/** 초 단위를 "12초", "1분 20초" 형식으로 표시 */
export function formatDurationSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r === 0) return `${m}분`;
  return `${m}분 ${r}초`;
}
