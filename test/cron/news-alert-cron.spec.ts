import { describe, it, expect, beforeEach, vi } from "vitest";
import { runNewsAlertCron } from "../../src/cron/news-alert-cron";
import { sendFCMNotification } from "../../src/notifications/fcm-sender";
import type { Env } from "../../src/index";

vi.mock("../../src/notifications/fcm-sender", () => ({
  sendFCMNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../src/util", () => ({
  API_KEY: "test-api-key",
  API_URL: "https://api.test.com",
}));

// Mock global fetch
global.fetch = vi.fn();

describe("News Alert Cron Job", () => {
  let mockEnv: Env;
  let mockKv: KVNamespace;
  let mockDb: any;
  let mockCtx: ExecutionContext;

  // Get today's date in YYYY-MM-DD format
  const getTodayStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  };

  // Get yesterday's date
  const getYesterdayStr = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      prepare: vi.fn(),
    };

    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
    } as unknown as KVNamespace;

    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    mockEnv = {
      stockly: mockDb as unknown as D1Database,
      alertsKv: mockKv,
      FCM_SERVICE_ACCOUNT: JSON.stringify({
        type: "service_account",
        project_id: "test-project",
        private_key_id: "test-key-id",
        private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
        client_email: "test@test-project.iam.gserviceaccount.com",
      }),
    } as Env;
  });

  describe("User Symbol Collection", () => {
    it("should collect unique symbols from all users", async () => {
      // Setup: User 1 has LXEO, AMZN; User 2 has AMZN, AAPL; User 3 has AAPL, LXEO, BABA
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO", "AMZN"]) },
          { user_id: "user2", news_favorite_symbols: JSON.stringify(["AMZN", "AAPL"]) },
          { user_id: "user3", news_favorite_symbols: JSON.stringify(["AAPL", "LXEO", "BABA"]) },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      // Mock empty news response (no news today)
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      // Mock KV for deduplication (no existing articles)
      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Verify: Should fetch news for all unique symbols in one call
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (global.fetch as any).mock.calls[0][0] as string;
      expect(fetchCall).toContain("symbols=");
      // Should contain all unique symbols: LXEO, AMZN, AAPL, BABA
      expect(fetchCall).toContain("LXEO");
      expect(fetchCall).toContain("AMZN");
      expect(fetchCall).toContain("AAPL");
      expect(fetchCall).toContain("BABA");
      // Should filter by today's date
      expect(fetchCall).toContain(`from=${getTodayStr()}`);
      expect(fetchCall).toContain(`to=${getTodayStr()}`);
    });

    it("should normalize symbols to uppercase", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["lxeo", "amzn"]) },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      const fetchCall = (global.fetch as any).mock.calls[0][0] as string;
      // Should normalize to uppercase
      expect(fetchCall).toContain("LXEO");
      expect(fetchCall).toContain("AMZN");
    });

    it("should skip users with no favorite symbols", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
          { user_id: "user2", news_favorite_symbols: null },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should still fetch news (for user1's LXEO)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("News Fetching and Filtering", () => {
    it("should fetch news for all symbols in one batch call", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO", "AMZN"]) },
          { user_id: "user2", news_favorite_symbols: JSON.stringify(["AAPL"]) },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      const todayStr = getTodayStr();
      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-news",
        },
        {
          title: "AMZN News Today",
          publishedDate: `${todayStr}T11:00:00Z`,
          symbol: "AMZN",
          url: "https://example.com/amzn-news",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should make only ONE API call for all symbols
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (global.fetch as any).mock.calls[0][0] as string;
      expect(fetchCall).toContain("symbols=LXEO,AMZN,AAPL");
    });

    it("should only process news published today", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
        ],
      };

      let callCount = 0;
      const mockStmt = {
        all: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: user_settings
          if (callCount === 1) {
            return Promise.resolve(mockSettings);
          }
          // Subsequent calls: push tokens
          return Promise.resolve({
            results: [
              { user_id: "user1", token: "token-user1" },
            ],
          });
        }),
        bind: vi.fn().mockReturnThis(),
      };

      mockDb.prepare.mockReturnValue(mockStmt as any);

      const todayStr = getTodayStr();
      const yesterdayStr = getYesterdayStr();

      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-today",
        },
        {
          title: "LXEO News Yesterday",
          publishedDate: `${yesterdayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-yesterday",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      // Mock KV: First article (today) doesn't exist, second (yesterday) doesn't exist
      (mockKv.get as any).mockImplementation((key: string) => {
        // Both articles are new, but only today's should be processed
        return Promise.resolve(null);
      });

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should only send notification for today's news (yesterday's news should be skipped)
      // The date comparison filters out yesterday's news before sending notifications
      const calls = (sendFCMNotification as any).mock.calls;
      // Should have exactly 1 call (for today's news only)
      expect(calls.length).toBe(1);
      // Verify today's news was sent
      expect(calls[0][1]).toBe("LXEO News");
      expect(calls[0][2]).toBe("LXEO News Today");
    });

    it("should handle empty news response", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should not send any notifications
      expect(sendFCMNotification).not.toHaveBeenCalled();
    });
  });

  describe("Deduplication", () => {
    it("should not send duplicate notifications for the same article", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
        ],
      };

      let callCount = 0;
      const mockStmt = {
        all: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: user_settings
          if (callCount === 1) {
            return Promise.resolve(mockSettings);
          }
          // Subsequent calls: push tokens
          return Promise.resolve({
            results: [
              { user_id: "user1", token: "token-user1" },
            ],
          });
        }),
        bind: vi.fn().mockReturnThis(),
      };

      mockDb.prepare.mockReturnValue(mockStmt as any);

      const todayStr = getTodayStr();
      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-news",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      // First run: Article doesn't exist in KV
      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should send notification
      expect(sendFCMNotification).toHaveBeenCalledTimes(1);

      // Second run: Article exists in KV (already notified)
      vi.clearAllMocks();
      (mockKv.get as any).mockResolvedValue("1"); // Article exists

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should NOT send duplicate notification
      expect(sendFCMNotification).not.toHaveBeenCalled();
    });

    it("should mark articles as seen in KV after sending notification", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      const todayStr = getTodayStr();
      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-news",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should mark article as seen in KV
      expect(mockKv.put).toHaveBeenCalled();
      const putCall = (mockKv.put as any).mock.calls[0];
      expect(putCall[0]).toContain("news:LXEO:");
      expect(putCall[1]).toBe("1");
      expect(putCall[2]).toHaveProperty("expirationTtl");
    });
  });

  describe("Notification Sending", () => {
    it("should send notifications to all users who have the symbol in favorites", async () => {
      // Setup: User 1 and User 3 have LXEO; User 2 has AMZN
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO", "AMZN"]) },
          { user_id: "user2", news_favorite_symbols: JSON.stringify(["AMZN", "AAPL"]) },
          { user_id: "user3", news_favorite_symbols: JSON.stringify(["AAPL", "LXEO", "BABA"]) },
        ],
      };

      let callCount = 0;
      const mockStmt = {
        all: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: user_settings
          if (callCount === 1) {
            return Promise.resolve(mockSettings);
          }
          // Subsequent calls: push tokens
          return Promise.resolve({
            results: [
              { user_id: "user1", push_token: "token-user1" },
              { user_id: "user3", push_token: "token-user3" },
            ],
          });
        }),
        bind: vi.fn().mockReturnThis(),
      };

      mockDb.prepare.mockReturnValue(mockStmt as any);

      const todayStr = getTodayStr();
      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-news",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should send notification to user1 and user3 (both have LXEO)
      expect(sendFCMNotification).toHaveBeenCalledTimes(2);
      
      const calls = (sendFCMNotification as any).mock.calls;
      const tokens = calls.map((call: any[]) => call[0]);
      expect(tokens).toContain("token-user1");
      expect(tokens).toContain("token-user3");
    });

    it("should send separate notifications for different symbols", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO", "AMZN"]) },
          { user_id: "user2", news_favorite_symbols: JSON.stringify(["AMZN"]) },
        ],
      };

      let callCount = 0;
      const mockStmt = {
        all: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: user_settings
          if (callCount === 1) {
            return Promise.resolve(mockSettings);
          }
          // Subsequent calls: push tokens (for LXEO and AMZN)
          return Promise.resolve({
            results: [
              { user_id: "user1", token: "token-user1" },
              { user_id: "user2", token: "token-user2" },
            ],
          });
        }),
        bind: vi.fn().mockReturnThis(),
      };

      mockDb.prepare.mockReturnValue(mockStmt as any);

      const todayStr = getTodayStr();
      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-news",
        },
        {
          title: "AMZN News Today",
          publishedDate: `${todayStr}T11:00:00Z`,
          symbol: "AMZN",
          url: "https://example.com/amzn-news",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should send notifications:
      // - LXEO: user1 (1 notification)
      // - AMZN: user1, user2 (2 notifications)
      // Total: 3 notifications
      // Note: user1 gets notifications for both LXEO and AMZN
      const calls = (sendFCMNotification as any).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(3);
      
      // Verify notifications were sent for both symbols
      const lxeoCalls = calls.filter((call: any[]) => call[1] === "LXEO News");
      const amznCalls = calls.filter((call: any[]) => call[1] === "AMZN News");
      expect(lxeoCalls.length).toBeGreaterThanOrEqual(1);
      expect(amznCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("should not send notifications if user has no push token", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
        ],
      };

      let callCount = 0;
      const mockStmt = {
        all: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: user_settings
          if (callCount === 1) {
            return Promise.resolve(mockSettings);
          }
          // Subsequent calls: push tokens - no tokens
          return Promise.resolve({ results: [] });
        }),
        bind: vi.fn().mockReturnThis(),
      };

      mockDb.prepare.mockReturnValue(mockStmt as any);

      const todayStr = getTodayStr();
      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-news",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should not send any notifications (no push tokens)
      expect(sendFCMNotification).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle API fetch errors gracefully", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Should not throw error
      await expect(runNewsAlertCron(mockEnv, mockCtx)).resolves.not.toThrow();
      expect(sendFCMNotification).not.toHaveBeenCalled();
    });

    it("should handle network errors gracefully", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      (global.fetch as any).mockRejectedValue(new Error("Network error"));

      // Should not throw error
      await expect(runNewsAlertCron(mockEnv, mockCtx)).resolves.not.toThrow();
    });

    it("should skip users with invalid favorite symbols JSON", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
          { user_id: "user2", news_favorite_symbols: "invalid-json" },
        ],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      // Should not throw error
      await expect(runNewsAlertCron(mockEnv, mockCtx)).resolves.not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle no users with favorite symbols", async () => {
      const mockSettings = {
        results: [],
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockSettings),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should not fetch news
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should handle missing alertsKv gracefully", async () => {
      const envWithoutKv = {
        ...mockEnv,
        alertsKv: undefined,
      };

      await runNewsAlertCron(envWithoutKv as Env, mockCtx);

      // Should not fetch news
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("Complete Use Case Flow", () => {
    it("should handle the complete use case: 3 PM check with multiple users and symbols", async () => {
      // Setup: User 1: [LXEO, AMZN], User 2: [AMZN, AAPL], User 3: [AAPL, LXEO, BABA]
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO", "AMZN"]) },
          { user_id: "user2", news_favorite_symbols: JSON.stringify(["AMZN", "AAPL"]) },
          { user_id: "user3", news_favorite_symbols: JSON.stringify(["AAPL", "LXEO", "BABA"]) },
        ],
      };

      let callCount = 0;
      const mockStmt = {
        all: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: user_settings
          if (callCount === 1) {
            return Promise.resolve(mockSettings);
          }
          // Subsequent calls: push tokens (for LXEO and AMZN)
          return Promise.resolve({
            results: [
              { user_id: "user1", token: "token-user1" },
              { user_id: "user2", token: "token-user2" },
              { user_id: "user3", token: "token-user3" },
            ],
          });
        }),
        bind: vi.fn().mockReturnThis(),
      };

      mockDb.prepare.mockReturnValue(mockStmt as any);

      const todayStr = getTodayStr();
      // News for LXEO and AMZN published today
      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-news",
        },
        {
          title: "AMZN News Today",
          publishedDate: `${todayStr}T11:00:00Z`,
          symbol: "AMZN",
          url: "https://example.com/amzn-news",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      // Verify: Should fetch news for all unique symbols in ONE call
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (global.fetch as any).mock.calls[0][0] as string;
      expect(fetchCall).toContain("symbols=LXEO,AMZN,AAPL,BABA");

      // Verify: Should send notifications
      // - LXEO: user1, user3 (2 notifications)
      // - AMZN: user1, user2 (2 notifications)
      // Total: 4 notifications
      // Note: user1 gets notifications for both LXEO and AMZN
      const calls = (sendFCMNotification as any).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(4);
      
      // Verify notifications were sent for both symbols
      const lxeoCalls = calls.filter((call: any[]) => call[1] === "LXEO News");
      const amznCalls = calls.filter((call: any[]) => call[1] === "AMZN News");
      expect(lxeoCalls.length).toBeGreaterThanOrEqual(2);
      expect(amznCalls.length).toBeGreaterThanOrEqual(2);

      // Verify: Should mark articles as seen
      expect(mockKv.put).toHaveBeenCalledTimes(2); // One for each article
    });

    it("should handle 7 PM check: no duplicate notifications for same articles", async () => {
      const mockSettings = {
        results: [
          { user_id: "user1", news_favorite_symbols: JSON.stringify(["LXEO"]) },
        ],
      };

      let callCount = 0;
      const mockStmt = {
        all: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: user_settings
          if (callCount === 1) {
            return Promise.resolve(mockSettings);
          }
          // Subsequent calls: push tokens
          return Promise.resolve({
            results: [
              { user_id: "user1", token: "token-user1" },
            ],
          });
        }),
        bind: vi.fn().mockReturnThis(),
      };

      mockDb.prepare.mockReturnValue(mockStmt as any);

      const todayStr = getTodayStr();
      const mockNews = [
        {
          title: "LXEO News Today",
          publishedDate: `${todayStr}T10:00:00Z`,
          symbol: "LXEO",
          url: "https://example.com/lxeo-news",
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      // First run at 3 PM: Article doesn't exist
      (mockKv.get as any).mockResolvedValue(null);

      await runNewsAlertCron(mockEnv, mockCtx);

      expect(sendFCMNotification).toHaveBeenCalledTimes(1);

      // Second run at 7 PM: Article exists (already notified)
      vi.clearAllMocks();
      (mockKv.get as any).mockResolvedValue("1");

      await runNewsAlertCron(mockEnv, mockCtx);

      // Should NOT send duplicate notification
      expect(sendFCMNotification).not.toHaveBeenCalled();
    });
  });
});

