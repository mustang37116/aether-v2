export type CacheEntry<T> = { data: T; t: number; ttl: number };

const LS_PREFIX = 'aether-cache:';

export function setCached<T>(key: string, data: T, ttlMs: number) {
  try {
    const entry: CacheEntry<T> = { data, t: Date.now(), ttl: ttlMs };
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
  } catch {}
}

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.t !== 'number' || typeof entry.ttl !== 'number') return null;
    if (Date.now() - entry.t > entry.ttl) {
      // expired
      localStorage.removeItem(LS_PREFIX + key);
      return null;
    }
    return entry.data as T;
  } catch { return null; }
}

export function clearCached(key: string) {
  try { localStorage.removeItem(LS_PREFIX + key); } catch {}
}
