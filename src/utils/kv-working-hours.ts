/**
 * KV Working Hours Wrapper
 * Skips KV read/write operations outside of working hours to save on KV operations
 */

import type { KVNamespace } from '@cloudflare/workers-types';
import type { AdminConfig } from '../api/config';
import { isWithinWorkingHours } from './working-hours';

/**
 * Check if KV operations should be skipped based on working hours
 * @param config AdminConfig with workingHours configuration
 * @returns true if KV operations should be skipped (outside working hours), false otherwise
 */
export function shouldSkipKvOperations(config: AdminConfig): boolean {
  const workingHours = config.workingHours;
  
  // If working hours feature is disabled, never skip KV operations
  if (!workingHours || workingHours.enabled === false) {
    return false;
  }

  // Skip KV operations outside working hours
  return !isWithinWorkingHours(config);
}

/**
 * Wrapper for KV.get that skips the operation outside working hours
 * @param kv KVNamespace instance
 * @param key Cache key
 * @param config AdminConfig for working hours check
 * @returns null if outside working hours, otherwise result of kv.get()
 */
export async function kvGetWithWorkingHours(
  kv: KVNamespace | undefined,
  key: string,
  config: AdminConfig
): Promise<string | null> {
  if (!kv) {
    return null;
  }

  // Skip KV read outside working hours
  if (shouldSkipKvOperations(config)) {
    return null;
  }

  return kv.get(key);
}

/**
 * Wrapper for KV.put that skips the operation outside working hours
 * @param kv KVNamespace instance
 * @param key Cache key
 * @param value Value to store
 * @param config AdminConfig for working hours check
 * @param options Optional KV put options (expirationTtl, etc.)
 * @returns Promise that resolves immediately if outside working hours, otherwise kv.put()
 */
export async function kvPutWithWorkingHours(
  kv: KVNamespace | undefined,
  key: string,
  value: string,
  config: AdminConfig,
  options?: { expirationTtl?: number }
): Promise<void> {
  if (!kv) {
    return;
  }

  // Skip KV write outside working hours
  if (shouldSkipKvOperations(config)) {
    return;
  }

  return kv.put(key, value, options);
}

/**
 * Wrapper for KV.delete that skips the operation outside working hours
 * @param kv KVNamespace instance
 * @param key Cache key
 * @param config AdminConfig for working hours check
 * @returns Promise that resolves immediately if outside working hours, otherwise kv.delete()
 */
export async function kvDeleteWithWorkingHours(
  kv: KVNamespace | undefined,
  key: string,
  config: AdminConfig
): Promise<void> {
  if (!kv) {
    return;
  }

  // Skip KV delete outside working hours
  if (shouldSkipKvOperations(config)) {
    return;
  }

  return kv.delete(key);
}

