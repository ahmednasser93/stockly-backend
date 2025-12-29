/**
 * KV Storage implementation of IStorage interface
 * Wraps Cloudflare KVNamespace to implement our abstraction
 */

// KVNamespace type is provided by wrangler
// It's available globally in Cloudflare Workers environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KVNamespace = any;

import type { IStorage } from './IStorage';

import type { Logger } from '../../logging/logger';

export class KVStorage implements IStorage {
  constructor(
    private kv: KVNamespace,
    private logger?: Logger
  ) {}

  async get(key: string): Promise<string | null> {
    const startTime = Date.now();
    try {
      const value = await this.kv.get(key);
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`KV get: ${key}`, {
        operation: 'kv',
        key,
        latencyMs,
        cacheStatus: value ? ('HIT' as const) : ('MISS' as const),
      });
      return value;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`KV get failed: ${key}`, {
        operation: 'kv',
        key,
        latencyMs,
        cacheStatus: 'N/A' as const,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const startTime = Date.now();
    try {
      await this.kv.put(key, value, options);
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`KV put: ${key}`, {
        operation: 'kv',
        key,
        latencyMs,
        cacheStatus: 'N/A' as const,
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`KV put failed: ${key}`, {
        operation: 'kv',
        key,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const startTime = Date.now();
    try {
      await this.kv.delete(key);
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`KV delete: ${key}`, {
        operation: 'kv',
        key,
        latencyMs,
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`KV delete failed: ${key}`, {
        operation: 'kv',
        key,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: Array<{ name: string }> }> {
    const startTime = Date.now();
    try {
      const result = await this.kv.list(options);
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`KV list: ${options?.prefix || 'all'}`, {
        operation: 'kv',
        key: options?.prefix || 'all',
        latencyMs,
        cacheStatus: 'N/A' as const,
      });
      return { keys: result.keys };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`KV list failed`, {
        operation: 'kv',
        key: options?.prefix || 'all',
        latencyMs,
        cacheStatus: 'N/A' as const,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

