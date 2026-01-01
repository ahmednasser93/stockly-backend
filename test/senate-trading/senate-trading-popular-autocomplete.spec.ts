/**
 * Tests for Popular Senators and Autocomplete endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPopularSenators, searchSenatorsAutocomplete } from "../../src/api/senate-trading-api";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

describe("Popular Senators API", () => {
  let env: Env;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.restoreAllMocks();
    env = {
      stockly: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      } as any,
    } as Env;
    logger = createMockLogger();
  });

  describe("getPopularSenators", () => {
    it("should return popular senators by trades", async () => {
      const mockSenators = [
        { senator_name: "Nancy Pelosi", trade_count: 25 },
        { senator_name: "John Doe", trade_count: 20 },
      ];

      env.stockly = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: mockSenators }),
        }),
      } as any;

      const request = new Request("https://example.com/v1/api/senate-trading/senators/popular?type=trades&limit=10", {
        headers: { "Origin": "http://localhost:5173" }
      });

      const response = await getPopularSenators(request, env, logger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.senators).toBeDefined();
      expect(Array.isArray(data.senators)).toBe(true);
    });

    it("should return popular senators by followers", async () => {
      const mockSenators = [
        { senator_name: "Nancy Pelosi", follower_count: 150 },
        { senator_name: "John Doe", follower_count: 100 },
      ];

      env.stockly = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: mockSenators }),
        }),
      } as any;

      const request = new Request("https://example.com/v1/api/senate-trading/senators/popular?type=followers&limit=10", {
        headers: { "Origin": "http://localhost:5173" }
      });

      const response = await getPopularSenators(request, env, logger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.senators).toBeDefined();
      expect(Array.isArray(data.senators)).toBe(true);
    });

    it("should validate limit parameter", async () => {
      const request = new Request("https://example.com/v1/api/senate-trading/senators/popular?type=trades&limit=100", {
        headers: { "Origin": "http://localhost:5173" }
      });

      const response = await getPopularSenators(request, env, logger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("limit must be between 1 and 50");
    });

    it("should validate type parameter", async () => {
      const request = new Request("https://example.com/v1/api/senate-trading/senators/popular?type=invalid&limit=10", {
        headers: { "Origin": "http://localhost:5173" }
      });

      const response = await getPopularSenators(request, env, logger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("type must be 'trades' or 'followers'");
    });
  });

  describe("searchSenatorsAutocomplete", () => {
    it("should return matching senators", async () => {
      const mockSenators = [
        { senator_name: "John Doe" },
        { senator_name: "John Smith" },
      ];

      env.stockly = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: mockSenators }),
        }),
      } as any;

      const request = new Request("https://example.com/v1/api/senate-trading/senators/autocomplete?query=John&limit=20", {
        headers: { "Origin": "http://localhost:5173" }
      });

      const response = await searchSenatorsAutocomplete(request, env, logger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.senators).toBeDefined();
      expect(Array.isArray(data.senators)).toBe(true);
      expect(data.senators.length).toBeGreaterThan(0);
    });

    it("should return empty array for empty query", async () => {
      const request = new Request("https://example.com/v1/api/senate-trading/senators/autocomplete?query=&limit=20", {
        headers: { "Origin": "http://localhost:5173" }
      });

      const response = await searchSenatorsAutocomplete(request, env, logger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.senators).toEqual([]);
    });

    it("should validate limit parameter", async () => {
      const request = new Request("https://example.com/v1/api/senate-trading/senators/autocomplete?query=John&limit=100", {
        headers: { "Origin": "http://localhost:5173" }
      });

      const response = await searchSenatorsAutocomplete(request, env, logger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("limit must be between 1 and 50");
    });

    it("should handle no results gracefully", async () => {
      env.stockly = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      } as any;

      const request = new Request("https://example.com/v1/api/senate-trading/senators/autocomplete?query=NonExistent&limit=20", {
        headers: { "Origin": "http://localhost:5173" }
      });

      const response = await searchSenatorsAutocomplete(request, env, logger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.senators).toEqual([]);
    });
  });
});

