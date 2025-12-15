import { describe, it, expect, beforeEach, vi } from "vitest";
import { LoggedKVNamespace } from "../../src/logging/kv-wrapper";
import { Logger } from "../../src/logging/logger";

describe("LoggedKVNamespace", () => {
  let mockKv: KVNamespace;
  let logger: Logger;
  let loggedKv: LoggedKVNamespace;

  beforeEach(() => {
    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as KVNamespace;

    logger = new Logger({
      traceId: "test-trace",
      userId: null,
      path: "/test",
      service: "test",
    });

    loggedKv = new LoggedKVNamespace(mockKv, logger);
  });

  describe("get", () => {
    it("should log HIT when value exists (text)", async () => {
      vi.mocked(mockKv.get).mockResolvedValue("cached-value");

      const result = await loggedKv.get("cache:key");

      expect(result).toBe("cached-value");
      expect(mockKv.get).toHaveBeenCalledWith("cache:key", "text");

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "kv",
        key: "cache:key",
        cacheStatus: "HIT",
      });
      expect(logs[0]).toHaveProperty("latencyMs");
    });

    it("should log MISS when value is null (text)", async () => {
      vi.mocked(mockKv.get).mockResolvedValue(null);

      const result = await loggedKv.get("cache:key");

      expect(result).toBeNull();

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        cacheStatus: "MISS",
      });
    });

    it("should log HIT when value exists (json)", async () => {
      const jsonValue = { data: "test" };
      vi.mocked(mockKv.get).mockResolvedValue(jsonValue);

      const result = await loggedKv.get("cache:key", "json");

      expect(result).toBe(jsonValue);
      expect(mockKv.get).toHaveBeenCalledWith("cache:key", "json");

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        cacheStatus: "HIT",
      });
    });

    it("should log MISS when value is null (json)", async () => {
      vi.mocked(mockKv.get).mockResolvedValue(null);

      const result = await loggedKv.get("cache:key", "json");

      expect(result).toBeNull();

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        cacheStatus: "MISS",
      });
    });

    it("should handle arrayBuffer type", async () => {
      const buffer = new ArrayBuffer(8);
      vi.mocked(mockKv.get).mockResolvedValue(buffer);

      const result = await loggedKv.get("cache:key", "arrayBuffer");

      expect(result).toBe(buffer);
      expect(mockKv.get).toHaveBeenCalledWith("cache:key", "arrayBuffer");
    });

    it("should handle stream type", async () => {
      const stream = new ReadableStream();
      vi.mocked(mockKv.get).mockResolvedValue(stream);

      const result = await loggedKv.get("cache:key", "stream");

      expect(result).toBe(stream);
      expect(mockKv.get).toHaveBeenCalledWith("cache:key", "stream");
    });

    it("should log failed get operation", async () => {
      const error = new Error("KV error");
      vi.mocked(mockKv.get).mockRejectedValue(error);

      await expect(loggedKv.get("cache:key")).rejects.toThrow("KV error");

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "kv",
        key: "cache:key",
        cacheStatus: "N/A",
        error: "KV error",
      });
    });

    it("should measure latency", async () => {
      vi.mocked(mockKv.get).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("value"), 10))
      );

      await loggedKv.get("cache:key");

      const logs = logger.getLogs();
      expect(logs[0].latencyMs).toBeGreaterThanOrEqual(5); // Allow for some jitter (setTimeout(10) might run in 9ms)
    });
  });

  describe("put", () => {
    it("should log successful put operation", async () => {
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      await loggedKv.put("cache:key", "value");

      expect(mockKv.put).toHaveBeenCalledWith("cache:key", "value", undefined);

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "kv",
        key: "cache:key",
        cacheStatus: "N/A",
      });
    });

    it("should log put with expiration options", async () => {
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      await loggedKv.put("cache:key", "value", { expirationTtl: 3600 });

      expect(mockKv.put).toHaveBeenCalledWith("cache:key", "value", { expirationTtl: 3600 });
    });

    it("should log failed put operation", async () => {
      const error = new Error("Put failed");
      vi.mocked(mockKv.put).mockRejectedValue(error);

      await expect(loggedKv.put("cache:key", "value")).rejects.toThrow("Put failed");

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        error: "Put failed",
      });
    });

    it("should handle ArrayBuffer value", async () => {
      const buffer = new ArrayBuffer(8);
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      await loggedKv.put("cache:key", buffer);

      expect(mockKv.put).toHaveBeenCalledWith("cache:key", buffer, undefined);
    });
  });

  describe("delete", () => {
    it("should log successful delete operation", async () => {
      vi.mocked(mockKv.delete).mockResolvedValue(undefined);

      await loggedKv.delete("cache:key");

      expect(mockKv.delete).toHaveBeenCalledWith("cache:key");

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "kv",
        key: "cache:key",
        cacheStatus: "N/A",
      });
    });

    it("should log failed delete operation", async () => {
      const error = new Error("Delete failed");
      vi.mocked(mockKv.delete).mockRejectedValue(error);

      await expect(loggedKv.delete("cache:key")).rejects.toThrow("Delete failed");

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        error: "Delete failed",
      });
    });
  });

  describe("list", () => {
    it("should log successful list operation without options", async () => {
      const mockResult = {
        keys: [{ name: "key1" }, { name: "key2" }],
        listComplete: true,
      };
      vi.mocked(mockKv.list).mockResolvedValue(mockResult);

      const result = await loggedKv.list();

      expect(result).toBe(mockResult);
      expect(mockKv.list).toHaveBeenCalledWith(undefined);

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "kv",
        key: "*",
        cacheStatus: "N/A",
      });
    });

    it("should log successful list operation with prefix", async () => {
      const mockResult = {
        keys: [{ name: "cache:key1" }],
        listComplete: true,
      };
      vi.mocked(mockKv.list).mockResolvedValue(mockResult);

      const result = await loggedKv.list({ prefix: "cache:" });

      expect(result).toBe(mockResult);
      expect(mockKv.list).toHaveBeenCalledWith({ prefix: "cache:" });

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        key: "cache:",
      });
    });

    it("should log successful list operation with limit", async () => {
      const mockResult = {
        keys: [],
        listComplete: true,
      };
      vi.mocked(mockKv.list).mockResolvedValue(mockResult);

      await loggedKv.list({ limit: 10 });

      expect(mockKv.list).toHaveBeenCalledWith({ limit: 10 });
    });

    it("should log successful list operation with cursor", async () => {
      const mockResult = {
        keys: [],
        listComplete: false,
        cursor: "next-cursor",
      };
      vi.mocked(mockKv.list).mockResolvedValue(mockResult);

      await loggedKv.list({ cursor: "cursor-123" });

      expect(mockKv.list).toHaveBeenCalledWith({ cursor: "cursor-123" });
    });

    it("should log failed list operation", async () => {
      const error = new Error("List failed");
      vi.mocked(mockKv.list).mockRejectedValue(error);

      await expect(loggedKv.list()).rejects.toThrow("List failed");

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        error: "List failed",
      });
    });
  });

  describe("error propagation", () => {
    it("should re-throw errors after logging", async () => {
      const error = new Error("KV error");
      vi.mocked(mockKv.get).mockRejectedValue(error);

      await expect(loggedKv.get("cache:key")).rejects.toThrow(error);

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
    });
  });

  describe("cache status detection", () => {
    it("should detect HIT for non-null text value", async () => {
      vi.mocked(mockKv.get).mockResolvedValue("value");
      await loggedKv.get("key");
      expect(logger.getLogs()[0].cacheStatus).toBe("HIT");
    });

    it("should detect HIT for non-null json value", async () => {
      vi.mocked(mockKv.get).mockResolvedValue({ data: "test" });
      await loggedKv.get("key", "json");
      expect(logger.getLogs()[0].cacheStatus).toBe("HIT");
    });

    it("should detect MISS for null value", async () => {
      vi.mocked(mockKv.get).mockResolvedValue(null);
      await loggedKv.get("key");
      expect(logger.getLogs()[0].cacheStatus).toBe("MISS");
    });

    it("should use N/A for put operations", async () => {
      vi.mocked(mockKv.put).mockResolvedValue(undefined);
      await loggedKv.put("key", "value");
      expect(logger.getLogs()[0].cacheStatus).toBe("N/A");
    });

    it("should use N/A for delete operations", async () => {
      vi.mocked(mockKv.delete).mockResolvedValue(undefined);
      await loggedKv.delete("key");
      expect(logger.getLogs()[0].cacheStatus).toBe("N/A");
    });

    it("should use N/A for list operations", async () => {
      vi.mocked(mockKv.list).mockResolvedValue({ keys: [], listComplete: true });
      await loggedKv.list();
      expect(logger.getLogs()[0].cacheStatus).toBe("N/A");
    });
  });
});

