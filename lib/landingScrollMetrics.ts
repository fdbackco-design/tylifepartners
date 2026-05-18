/** 문서 높이 대비 Y 위치 비율 (0~1). LANDING_SECTIONS start/end 조정용 */
export function yRatio(documentY: number, scrollHeight: number): number {
  if (scrollHeight <= 0) return 0;
  return Math.min(1, Math.max(0, documentY / scrollHeight));
}

export type LandingScrollMetrics = {
  scrollPercent: number;
  yRatioTop: number;
  yRatioCenter: number;
  yRatioBottom: number;
};

export function computeLandingScrollMetrics(): LandingScrollMetrics {
  const scrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  const scrollHeight = document.documentElement.scrollHeight;
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  const scrollPercent = maxScroll > 0 ? (scrollY / maxScroll) * 100 : 0;

  const yTop = scrollY;
  const yCenter = scrollY + viewportHeight / 2;
  const yBottom = scrollY + viewportHeight;

  return {
    scrollPercent,
    yRatioTop: yRatio(yTop, scrollHeight),
    yRatioCenter: yRatio(yCenter, scrollHeight),
    yRatioBottom: yRatio(yBottom, scrollHeight),
  };
}

export function formatYRatio(value: number): string {
  return value.toFixed(4);
}
