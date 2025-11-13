import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCache, setCache, clearCache } from "../src/api/cache";

describe("cache helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    clearCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns cached entries while TTL is valid", () => {
    setCache("quote:abc", { price: 10 }, 30);

    expect(getCache("quote:abc")).toEqual({ price: 10 });
  });

  it("expires entries once TTL elapses", () => {
    setCache("quote:abc", { price: 12 }, 1);
    vi.advanceTimersByTime(1500);

    expect(getCache("quote:abc")).toBeNull();
  });
});
