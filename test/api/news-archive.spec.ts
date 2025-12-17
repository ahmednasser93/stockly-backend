/**
 * News Archive API Tests
 * 
 * Comprehensive tests for news archive endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getArchivedNews,
  toggleArchivedNews,
} from "../../src/api/news-archive";
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

describe("News Archive API", () => {
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

  describe("getArchivedNews", () => {
    it("should return archived news for authenticated user", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123" }),
      };

      // Mock count query
      const countStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ total: 10 }),
      };

      // Mock articles query
      const articlesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: [
            {
              article_id: "article-1",
              symbol: "AAPL",
              title: "Test Article",
              url: "https://example.com/article",
              saved_at: new Date().toISOString(),
            },
          ],
        }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(articlesStmt);

      const request = createMockRequest("/v1/api/news/archive?page=1&limit=10");
      const response = await getArchivedNews(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.articles).toBeDefined();
      expect(Array.isArray(data.articles)).toBe(true);
    });

    it("should handle pagination correctly", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123" }),
      };

      // Mock count query
      const countStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ total: 25 }),
      };

      // Mock articles query
      const articlesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(countStmt)
        .mockReturnValueOnce(articlesStmt);

      const request = createMockRequest("/v1/api/news/archive?page=2&limit=10");
      const response = await getArchivedNews(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(2);
    });
  });

  describe("toggleArchivedNews", () => {
    it("should save article to archive", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123" }),
      };

      // Mock check (article not saved)
      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      // Mock insert
      const insertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(insertStmt);

      const articleId = "article-123";
      const request = createMockRequest(`/v1/api/news/archive/${articleId}`, {
        method: "POST",
        body: {
          symbol: "AAPL",
          title: "Test Article",
          url: "https://example.com/article",
        },
      });

      const response = await toggleArchivedNews(
        request,
        articleId,
        mockEnv,
        mockLogger
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.saved).toBe(true);
    });

    it("should remove article from archive if already saved", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123" }),
      };

      // Mock check (article already saved)
      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ article_id: "article-123" }),
      };

      // Mock delete
      const deleteStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(deleteStmt);

      const articleId = "article-123";
      const request = createMockRequest(`/v1/api/news/archive/${articleId}`, {
        method: "POST",
        body: {
          symbol: "AAPL",
          title: "Test Article",
          url: "https://example.com/article",
        },
      });

      const response = await toggleArchivedNews(
        request,
        articleId,
        mockEnv,
        mockLogger
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.saved).toBe(false);
    });
  });
});



