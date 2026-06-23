import { waitUntil } from "@vercel/functions";

/**
 * 응답 반환 뒤에도 백그라운드 작업이 끝까지 실행되도록 한다 (Vercel serverless).
 * 로컬 dev에서는 void Promise로 동일하게 스케줄한다.
 */
export function runAfterResponse(task: Promise<unknown>): void {
  if (process.env.VERCEL) {
    waitUntil(task);
    return;
  }
  void task.catch((e) => {
    console.error("[runAfterResponse] background task failed:", e);
  });
}
