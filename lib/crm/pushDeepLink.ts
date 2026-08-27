export const PENDING_OPEN_COMMENT_KEY = "crm_pending_open_comment";

export function stashPendingOpenComment(leadId: string): void {
  if (typeof window === "undefined" || !leadId) return;
  try {
    sessionStorage.setItem(PENDING_OPEN_COMMENT_KEY, leadId);
  } catch {
    // ignore
  }
}

export function takePendingOpenComment(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(PENDING_OPEN_COMMENT_KEY);
    if (value) sessionStorage.removeItem(PENDING_OPEN_COMMENT_KEY);
    return value;
  } catch {
    return null;
  }
}

export function peekPendingOpenComment(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(PENDING_OPEN_COMMENT_KEY);
  } catch {
    return null;
  }
}

export function parseOpenCommentFromUrl(raw: string): string | null {
  if (typeof window === "undefined" || !raw) return null;
  try {
    return new URL(raw, window.location.origin).searchParams.get("open_comment");
  } catch {
    return null;
  }
}

export function resolveAppUrl(raw: string): string {
  if (typeof window === "undefined") return raw;
  try {
    return new URL(raw, window.location.origin).href;
  } catch {
    return raw;
  }
}
