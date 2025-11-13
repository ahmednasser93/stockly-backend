const cache: Map<string, { data: any; expiresAt: number }> = new Map();

export function setCache(key: string, data: any, ttlSeconds: number) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function getCache(key: string) {
  const entry = getCacheEntry(key);
  if (!entry) return null;
  if (entry.expired) return null;
  return entry.data;
}

export function clearCache() {
  cache.clear();
}

export function getCacheEntry(key: string): { data: any; expired: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const expired = Date.now() > entry.expiresAt;
  if (expired) {
    cache.delete(key);
    return { data: entry.data, expired: true };
  }

  return { data: entry.data, expired: false };
}
