/**
 * Get News API Tests
 * 
 * Comprehensive tests for news endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getNews, getFavoriteNews } from "../../src/api/get-news";
import type { Env } from "../../src/index";
import {
  createMockEnv,
  createMockRequest,
  createMockLogger,
} from "../test-utils";
import { createMockD1Database } from "../utils/factories";
import * as authMiddleware from "../../src/auth/middleware";

vi.mock("../../src/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
  authenticateRequestWithAdmin: vi.fn(),
}));

describe("Get News API", () => {
  let mockEnv: Env;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
    
    // Default mock for authentication
    vi.mocked(authMiddleware.authenticateRequest).mockResolvedValue({
      username: "testuser",
      userId: "user-123",
      tokenType: "access" as const,
      isAdmin: false,
    });
  });

  describe("getNews", () => {
    it("should return news articles", async () => {
      // Mock external API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            title: "Test Article",
            url: "https://example.com/article",
            publishedDate: new Date().toISOString(),
            source: "Test Source",
          },
        ],
      } as Response);

      const request = createMockRequest("/v1/api/get-news?symbol=AAPL&page=1&limit=10");
      const response = await getNews(request, new URL(request.url), mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('news');
      expect(Array.isArray(data.news)).toBe(true);
    });

    it("should handle pagination correctly", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response);

      const request = createMockRequest("/v1/api/get-news?symbol=AAPL&page=2&limit=10");
      const response = await getNews(request, new URL(request.url), mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeDefined();
    });

    it("should handle external API errors gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const request = createMockRequest("/v1/api/get-news?symbol=AAPL");
      const response = await getNews(request, new URL(request.url), mockEnv, mockLogger);

      // getNews handles errors gracefully and returns 200 with empty news array
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('news');
      expect(Array.isArray(data.news)).toBe(true);
    });
  });

  describe("getFavoriteNews", () => {
    it("should return favorite news for authenticated user", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123" }),
      };

      // Mock settings query
      const settingsStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          news_favorite_symbols: '["AAPL", "GOOGL"]',
        }),
      };

      // Mock external API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            title: "Test Article",
            url: "https://example.com/article",
            publishedDate: new Date().toISOString(),
            source: "Test Source",
            symbol: "AAPL",
          },
        ],
      } as Response);

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(settingsStmt);

      const request = createMockRequest("/v1/api/get-news/favorite");
      const response = await getFavoriteNews(request, new URL(request.url), mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('news');
      expect(Array.isArray(data.news)).toBe(true);
    });
  });
});
