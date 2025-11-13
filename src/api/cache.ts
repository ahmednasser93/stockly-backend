const cache: Map<string, { data: any; expiresAt: number }> = new Map();

export function setCache(key: string, data: any, ttlSeconds: number) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function getCache(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export function clearCache() {
  cache.clear();
}
