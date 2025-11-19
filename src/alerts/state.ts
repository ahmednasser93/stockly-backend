/**
 * Alert state KV operations
 * 
 * NOTE: For performance, use state-cache.ts instead of these direct functions.
 * These are kept for backward compatibility and direct KV access when needed.
 */

import type { AlertStateSnapshot } from "./types";
import { getCachedState, updateStateInCache, invalidateState } from "./state-cache";

const kvKey = (id: string) => `alert:${id}:state`;

/**
 * Read alert state - checks cache first, falls back to KV
 * @deprecated Use state-cache.ts getCachedState() or loadAllStatesFromKV() for better performance
 */
export async function readAlertState(
  kv: KVNamespace,
  id: string
): Promise<AlertStateSnapshot | null> {
  // Check cache first
  const cached = getCachedState(id);
  if (cached) {
    return cached;
  }
  
  // Fall back to KV read
  const raw = await kv.get(kvKey(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AlertStateSnapshot;
    return parsed;
  } catch (error) {
    console.warn("failed to parse alert state", { id, error });
    return null;
  }
}

/**
 * Write alert state - uses cache with batched KV writes
 * @deprecated Use state-cache.ts updateStateInCache() for better performance
 */
export async function writeAlertState(
  kv: KVNamespace,
  id: string,
  state: AlertStateSnapshot
): Promise<void> {
  // Use cache-based update (queued for batched KV write)
  updateStateInCache(id, state);
  
  // For immediate writes, you can call kv.put directly, but this defeats the batching
  // await kv.put(kvKey(id), JSON.stringify(state));
}

/**
 * Delete alert state - removes from cache and KV
 */
export async function deleteAlertState(kv: KVNamespace, id: string): Promise<void> {
  // Invalidate cache
  invalidateState(id);
  
  // Delete from KV
  await kv.delete(kvKey(id));
}
