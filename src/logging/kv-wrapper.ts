/**
 * KV Namespace Wrapper with Logging
 * 
 * Wraps KV operations to automatically log latency and cache status.
 */

import type { KVNamespace } from "@cloudflare/workers-types";
import type { Logger } from "./logger";

/**
 * Wrapped KV namespace that logs all operations
 */
export class LoggedKVNamespace {
  constructor(
    private kv: KVNamespace,
    private logger: Logger
  ) {}

  async get(key: string, type?: "text"): Promise<string | null>;
  async get(key: string, type: "json"): Promise<unknown>;
  async get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  async get(key: string, type: "stream"): Promise<ReadableStream | null>;
  async get(
    key: string,
    type: "text" | "json" | "arrayBuffer" | "stream" = "text"
  ): Promise<string | unknown | ArrayBuffer | ReadableStream | null> {
    const startTime = Date.now();
    try {
      const result = await this.kv.get(key, type);
      const latencyMs = Date.now() - startTime;
      const cacheStatus = result !== null ? "HIT" : "MISS";
      this.logger.logDataOperation(`KV get: ${key}`, {
        operation: "kv",
        key,
        latencyMs,
        cacheStatus,
      });
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`KV get failed: ${key}`, {
        operation: "kv",
        key,
        latencyMs,
        cacheStatus: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { expirationTtl?: number; expiration?: number }
  ): Promise<void> {
    const startTime = Date.now();
    try {
      await this.kv.put(key, value, options);
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`KV put: ${key}`, {
        operation: "kv",
        key,
        latencyMs,
        cacheStatus: "N/A",
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`KV put failed: ${key}`, {
        operation: "kv",
        key,
        latencyMs,
        cacheStatus: "N/A",
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
      this.logger.logDataOperation(`KV delete: ${key}`, {
        operation: "kv",
        key,
        latencyMs,
        cacheStatus: "N/A",
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`KV delete failed: ${key}`, {
        operation: "kv",
        key,
        latencyMs,
        cacheStatus: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
    listComplete: boolean;
    cursor?: string;
  }> {
    const startTime = Date.now();
    try {
      const result = await this.kv.list(options);
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`KV list: prefix=${options?.prefix || "all"}`, {
        operation: "kv",
        key: options?.prefix || "*",
        latencyMs,
        cacheStatus: "N/A",
      });
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`KV list failed: prefix=${options?.prefix || "all"}`, {
        operation: "kv",
        key: options?.prefix || "*",
        latencyMs,
        cacheStatus: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}




