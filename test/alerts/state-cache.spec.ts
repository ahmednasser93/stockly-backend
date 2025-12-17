import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadAllStatesFromKV,
  getCachedState,
  updateStateInCache,
  flushPendingWritesToKV,
  invalidateState,
  clearCache,
  getCacheStats,
} from "../../src/alerts/state-cache";
import type { AlertStateSnapshot } from "../../src/alerts/types";

describe("Alert State Cache", () => {
  let mockKv: KVNamespace;

  beforeEach(() => {
    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
    } as unknown as KVNamespace;
    clearCache();
    vi.clearAllMocks();
  });

  describe("getCachedState", () => {
    it("should return null when state not cached", () => {
      const state = getCachedState("alert-1");
      expect(state).toBeNull();
    });

    it("should return cached state", () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };
      
      updateStateInCache("alert-1", snapshot);
      const state = getCachedState("alert-1");
      
      expect(state).toEqual(snapshot);
    });
  });

  describe("updateStateInCache", () => {
    it("should update state in cache", () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };
      
      updateStateInCache("alert-1", snapshot);
      const state = getCachedState("alert-1");
      
      expect(state).toEqual(snapshot);
    });

    it("should queue state for KV write", async () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };
      
      updateStateInCache("alert-1", snapshot);
      
      const stats = getCacheStats();
      expect(stats.pendingWrites).toBe(1);
    });
  });

  describe("loadAllStatesFromKV", () => {
    it("should load states from KV", async () => {
      const alertIds = ["alert-1", "alert-2"];
      const state1: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };
      const state2: AlertStateSnapshot = {
        lastPrice: 200,
        lastChecked: Date.now(),
        triggered: true,
      };

      vi.mocked(mockKv.get)
        .mockResolvedValueOnce(JSON.stringify(state1))
        .mockResolvedValueOnce(JSON.stringify(state2));

      const states = await loadAllStatesFromKV(mockKv, alertIds);

      expect(states).toHaveProperty("alert-1");
      expect(states).toHaveProperty("alert-2");
      expect(states["alert-1"]).toEqual(state1);
      expect(states["alert-2"]).toEqual(state2);
      expect(mockKv.get).toHaveBeenCalledTimes(2);
    });

    it("should cache loaded states in memory", async () => {
      const alertIds = ["alert-1"];
      const state: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(state));

      await loadAllStatesFromKV(mockKv, alertIds);
      
      // Second call should use cache, not KV
      vi.mocked(mockKv.get).mockClear();
      const cachedState = getCachedState("alert-1");
      
      expect(cachedState).toEqual(state);
      expect(mockKv.get).not.toHaveBeenCalled();
    });

    it("should return cached data if cache is fresh", async () => {
      const alertIds = ["alert-1"];
      const state: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      // Load once
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(state));
      await loadAllStatesFromKV(mockKv, alertIds);
      
      // Load again - should use cache
      vi.mocked(mockKv.get).mockClear();
      const states = await loadAllStatesFromKV(mockKv, alertIds);
      
      expect(states["alert-1"]).toEqual(state);
      expect(mockKv.get).not.toHaveBeenCalled();
    });

    it("should handle missing states", async () => {
      const alertIds = ["alert-1", "alert-2"];

      vi.mocked(mockKv.get)
        .mockResolvedValueOnce(JSON.stringify({ lastPrice: 100, lastChecked: Date.now(), triggered: false }))
        .mockResolvedValueOnce(null); // alert-2 not found

      const states = await loadAllStatesFromKV(mockKv, alertIds);

      expect(states).toHaveProperty("alert-1");
      expect(states).not.toHaveProperty("alert-2");
    });

    it("should handle invalid JSON", async () => {
      const alertIds = ["alert-1"];

      vi.mocked(mockKv.get).mockResolvedValue("invalid json");

      const states = await loadAllStatesFromKV(mockKv, alertIds);

      expect(states).not.toHaveProperty("alert-1");
    });

    it("should handle KV read errors", async () => {
      const alertIds = ["alert-1"];

      vi.mocked(mockKv.get).mockRejectedValue(new Error("KV error"));

      const states = await loadAllStatesFromKV(mockKv, alertIds);

      expect(states).not.toHaveProperty("alert-1");
    });
  });

  describe("flushPendingWritesToKV", () => {
    it("should write pending states to KV", async () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      updateStateInCache("alert-1", snapshot);
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      await flushPendingWritesToKV(mockKv, 3600);

      expect(mockKv.put).toHaveBeenCalledWith(
        "alert:alert-1:state",
        JSON.stringify(snapshot)
      );
      
      const stats = getCacheStats();
      expect(stats.pendingWrites).toBe(0);
    });

    it("should batch multiple writes", async () => {
      const snapshot1: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };
      const snapshot2: AlertStateSnapshot = {
        lastPrice: 200,
        lastChecked: Date.now(),
        triggered: true,
      };

      updateStateInCache("alert-1", snapshot1);
      updateStateInCache("alert-2", snapshot2);
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      await flushPendingWritesToKV(mockKv, 3600);

      expect(mockKv.put).toHaveBeenCalledTimes(2);
    });

    it("should not write if interval has not passed", async () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      updateStateInCache("alert-1", snapshot);
      await flushPendingWritesToKV(mockKv, 3600);
      
      vi.mocked(mockKv.put).mockClear();
      updateStateInCache("alert-2", snapshot);
      
      // Try to flush immediately - should skip
      await flushPendingWritesToKV(mockKv, 3600);
      
      expect(mockKv.put).not.toHaveBeenCalled();
    });

    it("should write if interval has passed", async () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      updateStateInCache("alert-1", snapshot);
      await flushPendingWritesToKV(mockKv, 3600);
      
      // Wait a bit and update
      await new Promise(resolve => setTimeout(resolve, 10));
      updateStateInCache("alert-2", snapshot);
      
      // Use very short interval (1 second) so it writes
      await flushPendingWritesToKV(mockKv, 0.001);
      
      expect(mockKv.put).toHaveBeenCalled();
    });

    it("should handle KV write errors gracefully", async () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      updateStateInCache("alert-1", snapshot);
      vi.mocked(mockKv.put).mockRejectedValue(new Error("KV write failed"));

      // Should not throw
      await expect(flushPendingWritesToKV(mockKv, 3600)).resolves.not.toThrow();
    });

    it("should return early if no pending writes", async () => {
      await flushPendingWritesToKV(mockKv, 3600);
      
      expect(mockKv.put).not.toHaveBeenCalled();
    });
  });

  describe("invalidateState", () => {
    it("should remove state from cache and pending writes", () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      updateStateInCache("alert-1", snapshot);
      expect(getCachedState("alert-1")).not.toBeNull();
      
      invalidateState("alert-1");
      
      expect(getCachedState("alert-1")).toBeNull();
      const stats = getCacheStats();
      expect(stats.pendingWrites).toBe(0);
    });
  });

  describe("clearCache", () => {
    it("should clear all cached states", () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      updateStateInCache("alert-1", snapshot);
      updateStateInCache("alert-2", snapshot);
      
      clearCache();
      
      expect(getCachedState("alert-1")).toBeNull();
      expect(getCachedState("alert-2")).toBeNull();
      
      const stats = getCacheStats();
      expect(stats.cachedStates).toBe(0);
      expect(stats.pendingWrites).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", () => {
      const snapshot: AlertStateSnapshot = {
        lastPrice: 100,
        lastChecked: Date.now(),
        triggered: false,
      };

      updateStateInCache("alert-1", snapshot);
      updateStateInCache("alert-2", snapshot);

      const stats = getCacheStats();

      expect(stats).toHaveProperty("cachedStates");
      expect(stats).toHaveProperty("pendingWrites");
      expect(stats).toHaveProperty("cacheAge");
      expect(stats).toHaveProperty("timeSinceLastKvWrite");
      expect(stats.cachedStates).toBe(2);
      expect(stats.pendingWrites).toBe(2);
    });
  });
});





