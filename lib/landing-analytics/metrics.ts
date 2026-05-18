/** 문서 높이 대비 현재 뷰포트 하단까지의 스크롤 깊이 (0~100) */
export function computeMaxDepthPercent(
  maxScrollY: number,
  viewportHeight: number,
  documentHeight: number
): number {
  if (documentHeight <= 0) return 0;
  const depth = ((maxScrollY + viewportHeight) / documentHeight) * 100;
  return Math.min(100, Math.max(0, depth));
}

export function maxDepthToYRatio(maxDepthPercent: number): number {
  return Math.min(1, Math.max(0, maxDepthPercent / 100));
}

export function readDocumentMetrics(): {
  documentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollY: number;
} {
  return {
    documentHeight: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollY: window.scrollY,
  };
}
