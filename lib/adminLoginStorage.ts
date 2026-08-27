const STORAGE_KEY = "tylife_admin_login";

export type SavedAdminLogin = {
  id: string;
  password: string;
};

export function loadSavedAdminLogin(): SavedAdminLogin | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedAdminLogin>;
    if (typeof parsed.id === "string" && typeof parsed.password === "string") {
      return { id: parsed.id, password: parsed.password };
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveAdminLogin(id: string, password: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, password }));
  } catch {
    // ignore
  }
}

export function clearSavedAdminLogin(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
