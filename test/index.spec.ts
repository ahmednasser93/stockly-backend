
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("../src/controllers/quotes.controller", () => ({ QuotesController: vi.fn() }));
vi.mock("../src/factories/createQuotesService", () => ({ createQuotesService: vi.fn() }));
vi.mock("../src/controllers/stocks.controller", () => ({ StockController: vi.fn() }));
vi.mock("../src/factories/createStockService", () => ({ createStockService: vi.fn() }));
vi.mock("../src/api/get-news", () => ({
  getFavoriteNews: vi.fn()
}));
vi.mock("../src/controllers/news.controller", () => ({ NewsController: vi.fn() }));
vi.mock("../src/factories/createNewsService", () => ({ createNewsService: vi.fn() }));
vi.mock("../src/controllers/search.controller", () => ({ SearchController: vi.fn() }));
vi.mock("../src/factories/createSearchService", () => ({ createSearchService: vi.fn() }));
vi.mock("../src/api/health", () => ({ healthCheck: vi.fn() }));
vi.mock("../src/controllers/alerts.controller", () => ({ AlertController: vi.fn() }));
vi.mock("../src/factories/createAlertService", () => ({ createAlertService: vi.fn() }));
vi.mock("../src/api/push-token", () => ({
  registerPushToken: vi.fn(),
  getPushToken: vi.fn()
}));
vi.mock("../src/controllers/preferences.controller", () => ({ PreferencesController: vi.fn() }));
vi.mock("../src/factories/createPreferencesService", () => ({ createPreferencesService: vi.fn() }));
vi.mock("../src/controllers/settings.controller", () => ({ SettingsController: vi.fn() }));
vi.mock("../src/factories/createSettingsService", () => ({ createSettingsService: vi.fn() }));
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
vi.mock("../src/controllers/favorite-stocks.controller", () => ({ FavoriteStocksController: vi.fn() }));
vi.mock("../src/factories/createFavoriteStocksService", () => ({ createFavoriteStocksService: vi.fn() }));
vi.mock("../src/api/users", () => ({
  getAllUsers: vi.fn()
}));
vi.mock("../src/cron/alerts-cron", () => ({ runAlertCron: vi.fn() }));
vi.mock("../src/cron/news-alert-cron", () => ({ runNewsAlertCron: vi.fn() }));
vi.mock("../src/controllers/historical.controller", () => ({ HistoricalController: vi.fn() }));
vi.mock("../src/factories/createHistoricalService", () => ({ createHistoricalService: vi.fn() }));
vi.mock("../src/api/openapi", () => ({ getOpenApiSpec: vi.fn() }));
vi.mock("../src/api/config", () => ({
  getConfigEndpoint: vi.fn(),
  updateConfigEndpoint: vi.fn(),
  simulateProviderFailureEndpoint: vi.fn(),
  disableProviderFailureEndpoint: vi.fn(),
  getConfig: vi.fn(),
}));
vi.mock("../src/utils/working-hours", () => ({
  isWithinWorkingHours: vi.fn(),
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
import * as QuotesControllerMock from "../src/controllers/quotes.controller";
import * as createQuotesServiceMock from "../src/factories/createQuotesService";
import * as StockControllerMock from "../src/controllers/stocks.controller";
import * as createStockServiceMock from "../src/factories/createStockService";
import * as NewsControllerMock from "../src/controllers/news.controller";
import * as createNewsServiceMock from "../src/factories/createNewsService";
import * as SearchControllerMock from "../src/controllers/search.controller";
import * as createSearchServiceMock from "../src/factories/createSearchService";
import * as healthMock from "../src/api/health";
import * as AlertControllerMock from "../src/controllers/alerts.controller";
import * as createAlertServiceMock from "../src/factories/createAlertService";
import * as pushTokenMock from "../src/api/push-token";
import * as PreferencesControllerMock from "../src/controllers/preferences.controller";
import * as createPreferencesServiceMock from "../src/factories/createPreferencesService";
import * as SettingsControllerMock from "../src/controllers/settings.controller";
import * as createSettingsServiceMock from "../src/factories/createSettingsService";
import * as adminMock from "../src/api/admin";
import * as devicesMock from "../src/api/devices";
import * as userPreferencesMock from "../src/api/user-preferences";
import * as newsArchiveMock from "../src/api/news-archive";
import * as FavoriteStocksControllerMock from "../src/controllers/favorite-stocks.controller";
import * as createFavoriteStocksServiceMock from "../src/factories/createFavoriteStocksService";
import * as alertsCronMock from "../src/cron/alerts-cron";
import * as newsAlertCronMock from "../src/cron/news-alert-cron";
import * as HistoricalControllerMock from "../src/controllers/historical.controller";
import * as createHistoricalServiceMock from "../src/factories/createHistoricalService";
import * as openapiMock from "../src/api/openapi";
import * as configMock from "../src/api/config";
import * as authMock from "../src/api/auth";
import * as workingHoursMock from "../src/utils/working-hours";
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
    // Default working hours - enabled, within hours
    vi.mocked(configMock.getConfig).mockResolvedValue({
      pollingIntervalSec: 30,
      kvWriteIntervalSec: 3600,
      primaryProvider: 'alpha-feed',
      backupProvider: 'beta-feed',
      alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
      marketCache: {
        marketDataTtlSec: 300,
        sectorsTtlSec: 2700,
      },
      workingHours: {
        enabled: true,
        startHour: 10,
        endHour: 23,
        timezone: 'Europe/Madrid',
      },
      featureFlags: {
        alerting: true,
        sandboxMode: false,
        simulateProviderFailure: false,
      },
    } as any);
    vi.mocked(workingHoursMock.isWithinWorkingHours).mockReturnValue(true);
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

  it("delegates /get-stock", async () => {
    const mockController = {
      getStock: vi.fn().mockResolvedValue(new Response(JSON.stringify({ symbol: "AAPL", price: 150 }), { status: 200 })),
    };
    vi.mocked(QuotesControllerMock.QuotesController).mockImplementation(() => mockController as any);
    vi.mocked(createQuotesServiceMock.createQuotesService).mockReturnValue({} as any);
    const response = await worker.fetch(makeRequest("/v1/api/get-stock?symbol=AAPL"), mockEnv, mockCtx);
    expect(mockController.getStock).toHaveBeenCalled();
  });

  it("delegates /get-stocks", async () => {
    const mockController = {
      getStocks: vi.fn().mockResolvedValue(new Response(JSON.stringify([{ symbol: "AAPL", price: 150 }]), { status: 200 })),
    };
    vi.mocked(QuotesControllerMock.QuotesController).mockImplementation(() => mockController as any);
    vi.mocked(createQuotesServiceMock.createQuotesService).mockReturnValue({} as any);
    const response = await worker.fetch(makeRequest("/v1/api/get-stocks?symbols=AAPL,MSFT"), mockEnv, mockCtx);
    expect(mockController.getStocks).toHaveBeenCalled();
  });
  // /get-stock-details is now handled by StockController, tested in stocks.controller.test.ts
  // /get-news, /news/general, and /get-stock-news are now handled by NewsController
  it("delegates /get-news", async () => {
    const mockController = {
      getNews: vi.fn().mockResolvedValue(new Response(JSON.stringify({ news: [] }), { status: 200 })),
    };
    vi.mocked(NewsControllerMock.NewsController).mockImplementation(() => mockController as any);
    vi.mocked(createNewsServiceMock.createNewsService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/get-news?symbol=AAPL", "GET"), mockEnv, mockCtx);
    expect(mockController.getNews).toHaveBeenCalled();
  });
  
  it("delegates /news/general", async () => {
    const mockController = {
      getGeneralNews: vi.fn().mockResolvedValue(new Response(JSON.stringify({ news: [] }), { status: 200 })),
    };
    vi.mocked(NewsControllerMock.NewsController).mockImplementation(() => mockController as any);
    vi.mocked(createNewsServiceMock.createNewsService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/news/general", "GET"), mockEnv, mockCtx);
    expect(mockController.getGeneralNews).toHaveBeenCalled();
  });
  
  it("delegates /news/favorites", async () => {
    const mockController = {
      getFavoriteNews: vi.fn().mockResolvedValue(new Response(JSON.stringify({ news: [], pagination: { page: 0, limit: 20, total: 0, hasMore: false } }), { status: 200 })),
    };
    vi.mocked(NewsControllerMock.NewsController).mockImplementation(() => mockController as any);
    vi.mocked(createNewsServiceMock.createNewsService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/news/favorites", "GET"), mockEnv, mockCtx);
    expect(mockController.getFavoriteNews).toHaveBeenCalled();
  });
  
  it("delegates /get-stock-news", async () => {
    const mockController = {
      getStockNews: vi.fn().mockResolvedValue(new Response(JSON.stringify({ news: [] }), { status: 200 })),
    };
    vi.mocked(NewsControllerMock.NewsController).mockImplementation(() => mockController as any);
    vi.mocked(createNewsServiceMock.createNewsService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/get-stock-news?symbol=AAPL", "GET"), mockEnv, mockCtx);
    expect(mockController.getStockNews).toHaveBeenCalled();
  });
  it("delegates /search-stock", async () => {
    const mockController = {
      searchStock: vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })),
    };
    vi.mocked(SearchControllerMock.SearchController).mockImplementation(() => mockController as any);
    vi.mocked(createSearchServiceMock.createSearchService).mockReturnValue({} as any);
    const response = await worker.fetch(makeRequest("/v1/api/search-stock"), mockEnv, mockCtx);
    expect(mockController.searchStock).toHaveBeenCalled();
  });

  it("delegates /get-historical", async () => {
    const mockController = {
      getHistorical: vi.fn().mockResolvedValue(new Response(JSON.stringify({ symbol: "AAPL", data: [] }), { status: 200 })),
    };
    vi.mocked(HistoricalControllerMock.HistoricalController).mockImplementation(() => mockController as any);
    vi.mocked(createHistoricalServiceMock.createHistoricalService).mockReturnValue({} as any);
    const response = await worker.fetch(makeRequest("/v1/api/get-historical?symbol=AAPL"), mockEnv, mockCtx);
    expect(mockController.getHistorical).toHaveBeenCalled();
  });

  it("delegates /get-historical-intraday", async () => {
    const mockController = {
      getHistoricalIntraday: vi.fn().mockResolvedValue(new Response(JSON.stringify({ symbol: "AAPL", data: [] }), { status: 200 })),
    };
    vi.mocked(HistoricalControllerMock.HistoricalController).mockImplementation(() => mockController as any);
    vi.mocked(createHistoricalServiceMock.createHistoricalService).mockReturnValue({} as any);
    const response = await worker.fetch(makeRequest("/v1/api/get-historical-intraday?symbol=AAPL"), mockEnv, mockCtx);
    expect(mockController.getHistoricalIntraday).toHaveBeenCalled();
  });

  it("delegates /health", async () => {
    const response = await worker.fetch(makeRequest("/v1/api/health"), mockEnv, mockCtx);
    expect(healthMock.healthCheck).toHaveBeenCalled();
  });

  it("delegates /openapi.json", () => verifyRoute("/openapi.json", "GET", openapiMock.getOpenApiSpec));

  it("delegates /alerts prefix", async () => {
    const mockController = {
      getAlert: vi.fn().mockResolvedValue(new Response(JSON.stringify({ alert: {} }), { status: 200 })),
    };
    vi.mocked(AlertControllerMock.AlertController).mockImplementation(() => mockController as any);
    vi.mocked(createAlertServiceMock.createAlertService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/alerts/some-alert", "GET"), mockEnv, mockCtx);
    expect(mockController.getAlert).toHaveBeenCalled();
  });

  it("delegates /push-token GET", () => verifyRoute("/v1/api/push-token", "GET", pushTokenMock.getPushToken));
  it("delegates /push-token POST", () => verifyRoute("/v1/api/push-token", "POST", pushTokenMock.registerPushToken));

  it("delegates /preferences GET", async () => {
    const mockController = {
      getPreferences: vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    };
    vi.mocked(PreferencesControllerMock.PreferencesController).mockImplementation(() => mockController as any);
    vi.mocked(createPreferencesServiceMock.createPreferencesService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/preferences", "GET"), mockEnv, mockCtx);
    expect(mockController.getPreferences).toHaveBeenCalled();
  });
  
  it("delegates /preferences PUT", async () => {
    const mockController = {
      updatePreferences: vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    };
    vi.mocked(PreferencesControllerMock.PreferencesController).mockImplementation(() => mockController as any);
    vi.mocked(createPreferencesServiceMock.createPreferencesService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/preferences", "PUT"), mockEnv, mockCtx);
    expect(mockController.updatePreferences).toHaveBeenCalled();
  });

  it("delegates /settings GET", async () => {
    const mockController = {
      getSettings: vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    };
    vi.mocked(SettingsControllerMock.SettingsController).mockImplementation(() => mockController as any);
    vi.mocked(createSettingsServiceMock.createSettingsService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/settings", "GET"), mockEnv, mockCtx);
    expect(mockController.getSettings).toHaveBeenCalled();
  });
  
  it("delegates /settings PUT", async () => {
    const mockController = {
      updateSettings: vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    };
    vi.mocked(SettingsControllerMock.SettingsController).mockImplementation(() => mockController as any);
    vi.mocked(createSettingsServiceMock.createSettingsService).mockReturnValue({} as any);
    
    const response = await worker.fetch(makeRequest("/v1/api/settings", "PUT"), mockEnv, mockCtx);
    expect(mockController.updateSettings).toHaveBeenCalled();
  });

  it("delegates /users/preferences/update", () => verifyRoute("/v1/api/users/preferences/update", "POST", userPreferencesMock.updateUserPreferences));

  it("delegates /news/archive GET", () => verifyRoute("/v1/api/news/archive", "GET", newsArchiveMock.getArchivedNews));
  it("delegates /news/archive/:id POST", async () => {
    const mockResponse = new Response("mocked");
    vi.mocked(newsArchiveMock.toggleArchivedNews).mockResolvedValue(mockResponse);
    const response = await worker.fetch(makeRequest("/v1/api/news/archive/123", "POST"), mockEnv, mockCtx);
    expect(newsArchiveMock.toggleArchivedNews).toHaveBeenCalledWith(expect.anything(), "123", expect.anything(), expect.anything());
  });

  it("delegates /favorite-stocks GET", async () => {
    const mockController = {
      getFavoriteStocks: vi.fn().mockResolvedValue(new Response(JSON.stringify({ stocks: [] }), { status: 200 })),
    };
    vi.mocked(FavoriteStocksControllerMock.FavoriteStocksController).mockImplementation(() => mockController as any);
    vi.mocked(createFavoriteStocksServiceMock.createFavoriteStocksService).mockReturnValue({} as any);
    const response = await worker.fetch(makeRequest("/v1/api/favorite-stocks", "GET"), mockEnv, mockCtx);
    expect(mockController.getFavoriteStocks).toHaveBeenCalled();
  });

  it("delegates /favorite-stocks POST", async () => {
    const mockController = {
      updateFavoriteStocks: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, stocks: [] }), { status: 200 })),
    };
    vi.mocked(FavoriteStocksControllerMock.FavoriteStocksController).mockImplementation(() => mockController as any);
    vi.mocked(createFavoriteStocksServiceMock.createFavoriteStocksService).mockReturnValue({} as any);
    const response = await worker.fetch(makeRequest("/v1/api/favorite-stocks", "POST"), mockEnv, mockCtx);
    expect(mockController.updateFavoriteStocks).toHaveBeenCalled();
  });
  it.skip("delegates /favorite-stocks ALL (moved to /v1/api/users/all)", () => {
    // This endpoint has been moved to /v1/api/users/all
  });
  
  it("delegates /users/all", async () => {
    const usersMock = await import("../src/api/users");
    await verifyRoute("/v1/api/users/all", "GET", vi.mocked(usersMock.getAllUsers));
  });
  it("delegates /favorite-stocks/:symbol DELETE", async () => {
    const mockController = {
      deleteFavoriteStock: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
    };
    vi.mocked(FavoriteStocksControllerMock.FavoriteStocksController).mockImplementation(() => mockController as any);
    vi.mocked(createFavoriteStocksServiceMock.createFavoriteStocksService).mockReturnValue({} as any);
    const response = await worker.fetch(makeRequest("/v1/api/favorite-stocks/MSFT", "DELETE"), mockEnv, mockCtx);
    expect(mockController.deleteFavoriteStock).toHaveBeenCalledWith(expect.any(Request), "MSFT");
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

    it("skips cron jobs when outside working hours", async () => {
      // Arrange - mock outside working hours
      vi.mocked(workingHoursMock.isWithinWorkingHours).mockReturnValue(false);

      // Act
      await worker.scheduled({ cron: "*/5 * * * *" } as any, mockEnv, mockCtx);

      // Assert - cron should not run
      expect(alertsCronMock.runAlertCron).not.toHaveBeenCalled();
      expect(configMock.getConfig).toHaveBeenCalledWith(mockEnv);
    });

    it("runs cron jobs when within working hours", async () => {
      // Arrange - mock within working hours
      vi.mocked(workingHoursMock.isWithinWorkingHours).mockReturnValue(true);

      // Act
      await worker.scheduled({ cron: "*/5 * * * *" } as any, mockEnv, mockCtx);

      // Assert - cron should run
      expect(alertsCronMock.runAlertCron).toHaveBeenCalled();
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
