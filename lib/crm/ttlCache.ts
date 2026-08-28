type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

/** 프로세스 메모리 TTL 캐시 (서버리스 인스턴스 단위). */
export function getTtlCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setTtlCache<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
}

export function invalidateTtlCache(key: string): void {
  store.delete(key);
}

export async function getOrLoadTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = getTtlCache<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  setTtlCache(key, value, ttlMs);
  return value;
}
