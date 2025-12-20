
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("../src/api/get-stock", () => ({ getStock: vi.fn() }));
vi.mock("../src/api/get-stocks", () => ({ getStocks: vi.fn() }));
vi.mock("../src/api/get-stock-details", () => ({ getStockDetailsRoute: vi.fn() }));
vi.mock("../src/api/get-news", () => ({
  getNews: vi.fn(),
  getGeneralNews: vi.fn(),
  getFavoriteNews: vi.fn()
}));
vi.mock("../src/api/get-stock-news", () => ({ getStockNews: vi.fn() }));
vi.mock("../src/api/search-stock", () => ({ searchStock: vi.fn() }));
vi.mock("../src/api/health", () => ({ healthCheck: vi.fn() }));
vi.mock("../src/api/alerts", () => ({ handleAlertsRequest: vi.fn() }));
vi.mock("../src/api/push-token", () => ({
  registerPushToken: vi.fn(),
  getPushToken: vi.fn()
}));
vi.mock("../src/api/preferences", () => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn()
}));
vi.mock("../src/api/settings", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn()
}));
vi.mock("../src/api/admin", () => ({
  getRecentNotifications: vi.fn(),
  getFailedNotifications: vi.fn(),
  retryNotification: vi.fn()
}));
vi.mock("../src/api/devices", () => ({
  getAllDevices: vi.fn(),
  sendTestNotification: vi.fn(),
  deleteDevice: vi.fn()
}));
vi.mock("../src/api/user-preferences", () => ({ updateUserPreferences: vi.fn() }));
vi.mock("../src/api/news-archive", () => ({
  getArchivedNews: vi.fn(),
  toggleArchivedNews: vi.fn()
}));
vi.mock("../src/api/favorite-stocks", () => ({
  getFavoriteStocks: vi.fn(),
  updateFavoriteStocks: vi.fn(),
  deleteFavoriteStock: vi.fn(),
  getAllUsersFavoriteStocks: vi.fn()
}));
vi.mock("../src/api/users", () => ({
  getAllUsers: vi.fn()
}));
vi.mock("../src/cron/alerts-cron", () => ({ runAlertCron: vi.fn() }));
vi.mock("../src/cron/news-alert-cron", () => ({ runNewsAlertCron: vi.fn() }));
vi.mock("../src/api/get-historical", () => ({ getHistorical: vi.fn() }));
vi.mock("../src/api/get-historical-intraday", () => ({ getHistoricalIntraday: vi.fn() }));
vi.mock("../src/api/openapi", () => ({ getOpenApiSpec: vi.fn() }));
vi.mock("../src/api/config", () => ({
  getConfigEndpoint: vi.fn(),
  updateConfigEndpoint: vi.fn(),
  simulateProviderFailureEndpoint: vi.fn(),
  disableProviderFailureEndpoint: vi.fn(),
}));
vi.mock("../src/api/auth", () => ({
  handleGoogleAuth: vi.fn(),
  checkUsernameAvailability: vi.fn(),
  setUsername: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("../src/logging/loki-shipper", () => ({ sendLogsToLoki: vi.fn() }));

// Import worker and mocks
import worker from "../src/index";
import * as getStockMock from "../src/api/get-stock";
import * as getStocksMock from "../src/api/get-stocks";
import * as getStockDetailsMock from "../src/api/get-stock-details";
import * as getNewsMock from "../src/api/get-news";
import * as getStockNewsMock from "../src/api/get-stock-news";
import * as searchStockMock from "../src/api/search-stock";
import * as healthMock from "../src/api/health";
import * as alertsMock from "../src/api/alerts";
import * as pushTokenMock from "../src/api/push-token";
import * as preferencesMock from "../src/api/preferences";
import * as settingsMock from "../src/api/settings";
import * as adminMock from "../src/api/admin";
import * as devicesMock from "../src/api/devices";
import * as userPreferencesMock from "../src/api/user-preferences";
import * as newsArchiveMock from "../src/api/news-archive";
import * as favoriteStocksMock from "../src/api/favorite-stocks";
import * as alertsCronMock from "../src/cron/alerts-cron";
import * as newsAlertCronMock from "../src/cron/news-alert-cron";
import * as getHistoricalMock from "../src/api/get-historical";
import * as getHistoricalIntradayMock from "../src/api/get-historical-intraday";
import * as openapiMock from "../src/api/openapi";
import * as configMock from "../src/api/config";
import * as authMock from "../src/api/auth";
import type { Env } from "../src/index";

const makeRequest = (path: string, method: string = "GET") =>
  new Request(`https://example.com${path}`, { method });

const createMockEnv = (): Env => ({
  stockly: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue(undefined),
      }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as D1Database,
});

const createMockCtx = (): ExecutionContext => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} as unknown as ExecutionContext);

describe("worker router", () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockCtx = createMockCtx();
    vi.clearAllMocks();

    // Default valid responses
    vi.mocked(healthMock.healthCheck).mockReturnValue(new Response("ok"));
    // Add other defaults as needed
  });

  // Helper to verify routing
  const verifyRoute = async (path: string, method: string, mockFn: any) => {
    const mockResponse = new Response("mocked");
    mockFn.mockResolvedValue(mockResponse);

    const response = await worker.fetch(makeRequest(path, method), mockEnv, mockCtx);

    expect(mockFn).toHaveBeenCalled();
    expect(response).toBe(mockResponse);
  };

  it("delegates /get-stock", () => verifyRoute("/v1/api/get-stock", "GET", getStockMock.getStock));
  it("delegates /get-stocks", () => verifyRoute("/v1/api/get-stocks", "GET", getStocksMock.getStocks));
  it("delegates /get-stock-details", () => verifyRoute("/v1/api/get-stock-details", "GET", getStockDetailsMock.getStockDetailsRoute));
  it("delegates /get-news", () => verifyRoute("/v1/api/get-news", "GET", getNewsMock.getNews));
  it("delegates /news/general", () => verifyRoute("/v1/api/news/general", "GET", getNewsMock.getGeneralNews));
  it("delegates /news/favorites", () => verifyRoute("/v1/api/news/favorites", "GET", getNewsMock.getFavoriteNews));
  it("delegates /get-stock-news", () => verifyRoute("/v1/api/get-stock-news", "GET", getStockNewsMock.getStockNews));
  it("delegates /search-stock", () => verifyRoute("/v1/api/search-stock", "GET", searchStockMock.searchStock));
  it("delegates /get-historical", () => verifyRoute("/v1/api/get-historical", "GET", getHistoricalMock.getHistorical));
  it("delegates /get-historical-intraday", () => verifyRoute("/v1/api/get-historical-intraday", "GET", getHistoricalIntradayMock.getHistoricalIntraday));

  it("delegates /health", async () => {
    const response = await worker.fetch(makeRequest("/v1/api/health"), mockEnv, mockCtx);
    expect(healthMock.healthCheck).toHaveBeenCalled();
  });

  it("delegates /openapi.json", () => verifyRoute("/openapi.json", "GET", openapiMock.getOpenApiSpec));

  it("delegates /alerts prefix", () => verifyRoute("/v1/api/alerts/some-alert", "GET", alertsMock.handleAlertsRequest));

  it("delegates /push-token GET", () => verifyRoute("/v1/api/push-token", "GET", pushTokenMock.getPushToken));
  it("delegates /push-token POST", () => verifyRoute("/v1/api/push-token", "POST", pushTokenMock.registerPushToken));

  it("delegates /preferences GET", () => verifyRoute("/v1/api/preferences", "GET", preferencesMock.getPreferences));
  it("delegates /preferences PUT", () => verifyRoute("/v1/api/preferences", "PUT", preferencesMock.updatePreferences));

  it("delegates /settings GET", () => verifyRoute("/v1/api/settings", "GET", settingsMock.getSettings));
  it("delegates /settings PUT", () => verifyRoute("/v1/api/settings", "PUT", settingsMock.updateSettings));

  it("delegates /users/preferences/update", () => verifyRoute("/v1/api/users/preferences/update", "POST", userPreferencesMock.updateUserPreferences));

  it("delegates /news/archive GET", () => verifyRoute("/v1/api/news/archive", "GET", newsArchiveMock.getArchivedNews));
  it("delegates /news/archive/:id POST", async () => {
    const mockResponse = new Response("mocked");
    vi.mocked(newsArchiveMock.toggleArchivedNews).mockResolvedValue(mockResponse);
    const response = await worker.fetch(makeRequest("/v1/api/news/archive/123", "POST"), mockEnv, mockCtx);
    expect(newsArchiveMock.toggleArchivedNews).toHaveBeenCalledWith(expect.anything(), "123", expect.anything(), expect.anything());
  });

  it("delegates /favorite-stocks GET", () => verifyRoute("/v1/api/favorite-stocks", "GET", favoriteStocksMock.getFavoriteStocks));
  it("delegates /favorite-stocks POST", () => verifyRoute("/v1/api/favorite-stocks", "POST", favoriteStocksMock.updateFavoriteStocks));
  it.skip("delegates /favorite-stocks ALL (moved to /v1/api/users/all)", () => {
    // This endpoint has been moved to /v1/api/users/all
  });
  
  it("delegates /users/all", async () => {
    const usersMock = await import("../src/api/users");
    await verifyRoute("/v1/api/users/all", "GET", vi.mocked(usersMock.getAllUsers));
  });
  it("delegates /favorite-stocks/:symbol DELETE", async () => {
    const mockResponse = new Response("mocked");
    vi.mocked(favoriteStocksMock.deleteFavoriteStock).mockResolvedValue(mockResponse);
    const response = await worker.fetch(makeRequest("/v1/api/favorite-stocks/MSFT", "DELETE"), mockEnv, mockCtx);
    expect(favoriteStocksMock.deleteFavoriteStock).toHaveBeenCalledWith(expect.anything(), "MSFT", expect.anything(), expect.anything());
  });

  it("delegates /notifications/recent", () => verifyRoute("/v1/api/notifications/recent", "GET", adminMock.getRecentNotifications));
  it("delegates /notifications/failed", () => verifyRoute("/v1/api/notifications/failed", "GET", adminMock.getFailedNotifications));
  it("delegates /notifications/retry/:id", async () => {
    const mockResponse = new Response("mocked");
    vi.mocked(adminMock.retryNotification).mockResolvedValue(mockResponse);
    const response = await worker.fetch(makeRequest("/v1/api/notifications/retry/123", "POST"), mockEnv, mockCtx);
    expect(adminMock.retryNotification).toHaveBeenCalledWith(expect.anything(), "123", expect.anything(), expect.anything());
  });

  it("delegates /devices GET", () => verifyRoute("/v1/api/devices", "GET", devicesMock.getAllDevices));
  it("delegates /devices DELETE", () => verifyRoute("/v1/api/devices", "DELETE", devicesMock.deleteDevice));
  it("delegates /devices/test POST", () => verifyRoute("/v1/api/devices/test", "POST", devicesMock.sendTestNotification));

  it("delegates /config/get", () => verifyRoute("/config/get", "GET", configMock.getConfigEndpoint));
  it("delegates /config/update", () => verifyRoute("/config/update", "POST", configMock.updateConfigEndpoint));
  it("delegates /simulate-provider-failure", () => verifyRoute("/v1/api/simulate-provider-failure", "POST", configMock.simulateProviderFailureEndpoint));
  it("delegates /disable-provider-failure", () => verifyRoute("/v1/api/disable-provider-failure", "POST", configMock.disableProviderFailureEndpoint));

  it("delegates /auth/google", () => verifyRoute("/v1/api/auth/google", "POST", authMock.handleGoogleAuth));
  it("delegates /auth/username/check", () => verifyRoute("/v1/api/auth/username/check", "GET", authMock.checkUsernameAvailability));
  it("delegates /auth/username", () => verifyRoute("/v1/api/auth/username", "POST", authMock.setUsername));
  it("delegates /auth/refresh", () => verifyRoute("/v1/api/auth/refresh", "POST", authMock.refreshToken));
  it("delegates /auth/me", () => verifyRoute("/v1/api/auth/me", "GET", authMock.getCurrentUser));
  it("delegates /auth/logout", () => verifyRoute("/v1/api/auth/logout", "POST", authMock.logout));

  it("returns 404 for unknown routes", async () => {
    const response = await worker.fetch(makeRequest("/unknown"), mockEnv, mockCtx);
    expect(response.status).toBe(404);
  });

  it("handles CORS OPTIONS request", async () => {
    const response = await worker.fetch(makeRequest("/any/path", "OPTIONS"), mockEnv, mockCtx);
    expect(response.status).toBe(204);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(true);
  });

  describe("Scheduled events", () => {
    it("runs alerts cron on correct schedule", async () => {
      await worker.scheduled({ cron: "*/5 * * * *" } as any, mockEnv, mockCtx);
      expect(alertsCronMock.runAlertCron).toHaveBeenCalled();
      expect(mockCtx.waitUntil).toHaveBeenCalled();
    });

    it("runs news alerts cron on correct schedule", async () => {
      await worker.scheduled({ cron: "0 */6 * * *" } as any, mockEnv, mockCtx);
      expect(newsAlertCronMock.runNewsAlertCron).toHaveBeenCalled();
      expect(mockCtx.waitUntil).toHaveBeenCalled();
    });
    it("handles unhandled errors", async () => {
      // Mock health check to throw error
      vi.mocked(healthMock.healthCheck).mockImplementationOnce(() => {
        throw new Error("Test error");
      });

      const response = await worker.fetch(makeRequest("/v1/api/health"), mockEnv, mockCtx);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Internal Server Error" });
    });

    it("ships logs if LOKI_URL is present", async () => {
      mockEnv.LOKI_URL = "https://loki.example.com";

      await worker.fetch(makeRequest("/v1/api/health"), mockEnv, mockCtx);

      expect(mockCtx.waitUntil).toHaveBeenCalled();
      // We can't easily check sendLogsToLoki arguments because it's called with the logger's internal log buffer
      // but checking waitUntil is called is a good proxy since the code only calls it if LOKI_URL is present
    });
    it("handles CORS requests with specific headers", async () => {
      const request = new Request("https://example.com/v1/api/get-stock", {
        method: "OPTIONS",
        headers: { "Access-Control-Request-Headers": "X-Custom-Header, Content-Type" }
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain("X-Custom-Header");
    });

    it("ships logs on OPTIONS request if LOKI_URL is present", async () => {
      mockEnv.LOKI_URL = "https://loki.example.com";
      const request = new Request("https://example.com/v1/api/get-stock", { method: "OPTIONS" });
      await worker.fetch(request, mockEnv, mockCtx);
      expect(mockCtx.waitUntil).toHaveBeenCalled();
    });

    it("returns 405 for invalid method on retry notification", async () => {
      const response = await worker.fetch(makeRequest("/v1/api/notifications/retry/123", "GET"), mockEnv, mockCtx);
      expect(response.status).toBe(405);
    });
  });
});
