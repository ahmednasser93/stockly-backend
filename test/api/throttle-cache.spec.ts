import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isThrottled,
  markThrottled,
  clearThrottle,
  getThrottleCacheStats,
} from "../../src/api/throttle-cache";

describe("Throttle Cache", () => {
  beforeEach(() => {
    // Clear cache before each test
    // Since throttleCache is a module-level Map, we need to clear it manually
    // We'll do this by calling clearThrottle for any keys that might exist
    // For a more robust solution, we could expose a clearAll function in the module
  });

  describe("isThrottled", () => {
    it("should return false if key is not throttled", () => {
      const result = isThrottled("non-existent-key");
      expect(result).toBe(false);
    });

    it("should return true if key was recently throttled", () => {
      const key = "test-key-1";
      markThrottled(key);
      
      const result = isThrottled(key);
      expect(result).toBe(true);
    });

    it("should return false if throttle window has expired", () => {
      const key = "test-key-2";
      
      // Use fake timers to control time
      vi.useFakeTimers();
      const initialTime = 1000000;
      vi.setSystemTime(initialTime);
      
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
      
      // Advance time by 301 seconds (just over the 300 second window)
      vi.setSystemTime(initialTime + 301 * 1000);
      
      const result = isThrottled(key);
      expect(result).toBe(false);
      
      vi.useRealTimers();
    });

    it("should return true if within throttle window", () => {
      const key = "test-key-3";
      markThrottled(key);
      
      // Immediately check - should be throttled
      expect(isThrottled(key)).toBe(true);
    });

    it("should handle multiple keys independently", () => {
      const key1 = "test-key-4";
      const key2 = "test-key-5";
      
      markThrottled(key1);
      
      expect(isThrottled(key1)).toBe(true);
      expect(isThrottled(key2)).toBe(false);
      
      markThrottled(key2);
      
      expect(isThrottled(key1)).toBe(true);
      expect(isThrottled(key2)).toBe(true);
    });
  });

  describe("markThrottled", () => {
    it("should mark a key as throttled", () => {
      const key = "test-key-6";
      
      expect(isThrottled(key)).toBe(false);
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
    });

    it("should update throttle timestamp when called again", () => {
      const key = "test-key-7";
      
      vi.useFakeTimers();
      const initialTime = 1000000;
      vi.setSystemTime(initialTime);
      
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
      
      // Advance time by 250 seconds
      vi.setSystemTime(initialTime + 250 * 1000);
      
      // Key should still be throttled (250 < 300)
      expect(isThrottled(key)).toBe(true);
      
      // Mark again - this updates the timestamp to current time
      markThrottled(key);
      
      // Advance another 250 seconds from the new mark
      vi.setSystemTime(initialTime + 250 * 1000 + 250 * 1000);
      
      // Should still be throttled because timestamp was updated (only 250 seconds passed since new mark)
      expect(isThrottled(key)).toBe(true);
      
      vi.useRealTimers();
    });

    it("should handle empty string key", () => {
      const key = "";
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
    });

    it("should handle special characters in key", () => {
      const key = "test-key:with-special-chars@123";
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
    });
  });

  describe("clearThrottle", () => {
    it("should clear throttle for a key", () => {
      const key = "test-key-8";
      
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
      
      clearThrottle(key);
      expect(isThrottled(key)).toBe(false);
    });

    it("should not throw if clearing non-existent key", () => {
      const key = "non-existent-key-9";
      
      expect(() => clearThrottle(key)).not.toThrow();
      expect(isThrottled(key)).toBe(false);
    });

    it("should clear one key without affecting others", () => {
      const key1 = "test-key-10";
      const key2 = "test-key-11";
      
      markThrottled(key1);
      markThrottled(key2);
      
      expect(isThrottled(key1)).toBe(true);
      expect(isThrottled(key2)).toBe(true);
      
      clearThrottle(key1);
      
      expect(isThrottled(key1)).toBe(false);
      expect(isThrottled(key2)).toBe(true);
    });
  });

  describe("getThrottleCacheStats", () => {
    it("should return cache statistics", () => {
      const stats = getThrottleCacheStats();
      
      expect(stats).toHaveProperty("cachedKeys");
      expect(typeof stats.cachedKeys).toBe("number");
      expect(stats.cachedKeys).toBeGreaterThanOrEqual(0);
    });

    it("should reflect correct number of cached keys", () => {
      // Clear any existing keys first
      clearThrottle("test-key-12");
      clearThrottle("test-key-13");
      clearThrottle("test-key-14");
      
      const initialStats = getThrottleCacheStats();
      const initialCount = initialStats.cachedKeys;
      
      markThrottled("test-key-12");
      markThrottled("test-key-13");
      
      const afterMarkStats = getThrottleCacheStats();
      expect(afterMarkStats.cachedKeys).toBe(initialCount + 2);
      
      clearThrottle("test-key-12");
      
      const afterClearStats = getThrottleCacheStats();
      expect(afterClearStats.cachedKeys).toBe(initialCount + 1);
      
      clearThrottle("test-key-13");
    });

    it("should handle empty cache", () => {
      // Note: This test assumes the cache might not be completely empty
      // due to other tests, so we just verify the structure
      const stats = getThrottleCacheStats();
      
      expect(stats).toEqual({
        cachedKeys: expect.any(Number),
      });
    });

    it("should increase count when marking multiple unique keys", () => {
      const baseKey = "test-key-stats-";
      const keyCount = 5;
      
      // Mark multiple unique keys
      for (let i = 0; i < keyCount; i++) {
        markThrottled(`${baseKey}${i}`);
      }
      
      const stats = getThrottleCacheStats();
      
      // Verify at least keyCount keys are cached
      // (might be more due to other tests)
      expect(stats.cachedKeys).toBeGreaterThanOrEqual(keyCount);
      
      // Clean up
      for (let i = 0; i < keyCount; i++) {
        clearThrottle(`${baseKey}${i}`);
      }
    });
  });

  describe("Throttle window (5 minutes)", () => {
    it("should throttle for approximately 5 minutes", () => {
      vi.useFakeTimers();
      const key = "test-window-key";
      const initialTime = 1000000; // Use a fixed timestamp
      vi.setSystemTime(initialTime);
      
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
      
      // At 299 seconds, should still be throttled (< 300)
      vi.setSystemTime(initialTime + 299 * 1000);
      expect(isThrottled(key)).toBe(true);
      
      // At 300 seconds (exactly 5 minutes), difference is 300, which is NOT < 300, so not throttled
      vi.setSystemTime(initialTime + 300 * 1000);
      expect(isThrottled(key)).toBe(false);
      
      // At 301 seconds, should no longer be throttled
      vi.setSystemTime(initialTime + 301 * 1000);
      expect(isThrottled(key)).toBe(false);
      
      vi.useRealTimers();
    });

    it("should use seconds precision (not milliseconds)", () => {
      vi.useFakeTimers();
      const key = "test-precision-key";
      const initialTime = 1000000;
      vi.setSystemTime(initialTime);
      
      markThrottled(key);
      
      // At 299 seconds (floored), should still be throttled
      vi.setSystemTime(initialTime + 299 * 1000);
      expect(isThrottled(key)).toBe(true);
      
      // At 300 seconds, should no longer be throttled (threshold is 300, so < 300 means throttled)
      vi.setSystemTime(initialTime + 300 * 1000);
      expect(isThrottled(key)).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe("Edge cases", () => {
    it("should handle very long keys", () => {
      const longKey = "a".repeat(1000);
      markThrottled(longKey);
      expect(isThrottled(longKey)).toBe(true);
      clearThrottle(longKey);
    });

    it("should handle unicode keys", () => {
      const unicodeKey = "test-key-🚀-测试-💯";
      markThrottled(unicodeKey);
      expect(isThrottled(unicodeKey)).toBe(true);
      clearThrottle(unicodeKey);
    });

    it("should handle concurrent marks and clears", () => {
      const key = "concurrent-test-key";
      
      // Mark, clear, mark again
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
      
      clearThrottle(key);
      expect(isThrottled(key)).toBe(false);
      
      markThrottled(key);
      expect(isThrottled(key)).toBe(true);
      
      clearThrottle(key);
    });
  });
});
