import { json, CORS_HEADERS, getCorsHeaders } from "./util";
import { createQuotesService } from "./factories/createQuotesService";
import { QuotesController } from "./controllers/quotes.controller";
import { createStockService } from "./factories/createStockService";
import { StockController } from "./controllers/stocks.controller";
import { createNewsService } from "./factories/createNewsService";
import { NewsController } from "./controllers/news.controller";
import { createSearchService } from "./factories/createSearchService";
import { SearchController } from "./controllers/search.controller";
import { healthCheck } from "./api/health";
import { createAlertService } from "./factories/createAlertService";
import { AlertController } from "./controllers/alerts.controller";
import { registerPushToken, getPushToken } from "./api/push-token";
import { createPreferencesService } from "./factories/createPreferencesService";
import { PreferencesController } from "./controllers/preferences.controller";
import { createSettingsService } from "./factories/createSettingsService";
import { SettingsController } from "./controllers/settings.controller";
import { getRecentNotifications, getFailedNotifications, retryNotification } from "./api/admin";
import { getAllDevices, sendTestNotification, deleteDevice } from "./api/devices";
import { updateUserPreferences } from "./api/user-preferences";
import { getArchivedNews, toggleArchivedNews } from "./api/news-archive";
import { createFavoriteStocksService } from "./factories/createFavoriteStocksService";
import { FavoriteStocksController } from "./controllers/favorite-stocks.controller";
import { getAllUsers, getUserByUsername, getUserDevices, getUserAlerts, getUserFavoriteStocks } from "./api/users";
import { runAlertCron } from "./cron/alerts-cron";
import { runNewsAlertCron } from "./cron/news-alert-cron";
import { runMarketPrefetchCron } from "./cron/market-prefetch-cron";
import { runSenateTradingCron } from "./cron/senate-trading-cron";
import { createHistoricalService } from "./factories/createHistoricalService";
import { HistoricalController } from "./controllers/historical.controller";
import { createMarketService } from "./factories/createMarketService";
import { MarketController } from "./controllers/market.controller";
import { createDividendService } from "./factories/createDividendService";
import { DividendController } from "./controllers/dividend.controller";
import { createCalendarService } from "./factories/createCalendarService";
import { CalendarController } from "./controllers/calendar.controller";
import { getOpenApiSpec } from "./api/openapi";
import { createCommonStocksService } from "./factories/createCommonStocksService";
import { CommonStocksController } from "./controllers/common-stocks.controller";
import { SenateTradingController } from "./controllers/senate-trading.controller";
import { createDatalakeService } from "./factories/createDatalakeService";
import { DatalakeController } from "./controllers/datalake.controller";
import {
  getConfigEndpoint,
  updateConfigEndpoint,
  simulateProviderFailureEndpoint,
  disableProviderFailureEndpoint,
  getConfig,
} from "./api/config";
import { isWithinWorkingHours } from "./utils/working-hours";
import {
  handleGoogleAuth,
  checkUsernameAvailability,
  setUsername,
  refreshToken,
  logout,
  getCurrentUser,
} from "./api/auth"
import { createUserService } from "./factories/createUserService";
import { UserController } from "./controllers/users.controller";;
import { Logger, extractUserId } from "./logging/logger";
import { sendLogsToLoki } from "./logging/loki-shipper";
import { LoggedD1Database } from "./logging/d1-wrapper";
import { LoggedKVNamespace } from "./logging/kv-wrapper";
import { D1DatabaseWrapper } from "./infrastructure/database/D1Database";
import { validateClientAuth } from "./middleware/clientAuth";

export interface Env {
  stockly: D1Database;
  alertsKv?: KVNamespace;
  marketKv?: KVNamespace;
  FCM_SERVICE_ACCOUNT?: string; // Google Cloud Service Account JSON as string
  FMP_API_KEY?: string; // Financial Modeling Prep API key (optional, falls back to hardcoded in util.ts)
  MOBILE_APP_API_KEY?: string; // API key for mobile app authentication
  LOKI_URL?: string; // Grafana Loki endpoint URL (e.g., "https://logs-prod-us-central-0.grafana.net")
  LOKI_USERNAME?: string; // Grafana Cloud username (instance ID) for Basic Auth
  LOKI_PASSWORD?: string; // Grafana Cloud API token or password for Basic Auth
  GOOGLE_CLIENT_ID?: string; // Google OAuth client ID
  GOOGLE_CLIENT_SECRET?: string; // Google OAuth client secret (optional, for additional verification)
  JWT_SECRET?: string; // Secret for signing JWT access tokens
  JWT_REFRESH_SECRET?: string; // Secret for signing JWT refresh tokens
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Generate traceId for this request
    const traceId = crypto.randomUUID();

    // Extract userId from request (if available)
    const userId = extractUserId(request, pathname);

    // Create logger with request context
    const logger = new Logger({
      traceId,
      userId,
      path: pathname,
      service: "stockly-api",
    });

    // Create logged wrappers for D1 and KV
    const loggedEnv = {
      ...env,
      stockly: new LoggedD1Database(env.stockly, logger),
      alertsKv: env.alertsKv ? new LoggedKVNamespace(env.alertsKv, logger) : undefined,
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      // Get the requested headers from the browser (comma-separated list)
      const requestedHeaders = request.headers.get("Access-Control-Request-Headers");

      // Build response headers with dynamic CORS support
      const corsHeaders = getCorsHeaders(request);
      const headers: HeadersInit = {
        ...corsHeaders,
      };

      // Echo back the requested headers if provided (browsers can be strict about header matching)
      // Some browsers require an exact match or superset of requested headers
      if (requestedHeaders) {
        // Merge requested headers with our default allowed headers
        // This ensures we allow everything the browser is requesting
        const defaultHeadersList = (CORS_HEADERS["Access-Control-Allow-Headers"] as string).split(", ").map(h => h.trim());
        const requestedHeadersList = requestedHeaders.split(",").map(h => h.trim());
        // Combine and deduplicate, keeping order (requested first, then defaults)
        const allHeadersSet = new Set([...requestedHeadersList, ...defaultHeadersList]);
        headers["Access-Control-Allow-Headers"] = Array.from(allHeadersSet).join(", ");
      }

      const response = new Response(null, {
        status: 204,
        headers,
      });

      // Ship logs asynchronously (non-blocking)
      if (env.LOKI_URL) {
        ctx.waitUntil(
          sendLogsToLoki(logger.getLogs(), {
            url: env.LOKI_URL,
            username: env.LOKI_USERNAME,
            password: env.LOKI_PASSWORD,
          })
        );
      }

      return response;
    }

    // Client authentication check (after CORS preflight, before route matching)
    const clientAuthResult = validateClientAuth(request, {
      allowedWebappOrigins: [
        "https://stockly-webapp.pages.dev",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
      ],
      mobileAppApiKey: env.MOBILE_APP_API_KEY || "",
      publicEndpoints: ["/v1/api/health", "/openapi.json"],
    });

    if (!clientAuthResult.isValid) {
      logger.warn(`Client authentication failed for ${pathname}`, {
        clientType: clientAuthResult.clientType,
        origin: request.headers.get("Origin"),
        hasMobileApiKey: !!request.headers.get("X-Client-API-Key"),
      });

      const response = json(
        { error: "Forbidden", message: "Client authentication required" },
        403,
        request
      );

      // Ship logs asynchronously (non-blocking)
      if (env.LOKI_URL) {
        ctx.waitUntil(
          sendLogsToLoki(logger.getLogs(), {
            url: env.LOKI_URL,
            username: env.LOKI_USERNAME,
            password: env.LOKI_PASSWORD,
          })
        );
      }

      return response;
    }

    let response: Response;

    try {
      if (pathname === "/openapi.json") {
        response = await getOpenApiSpec();
      } else if (pathname === "/v1/api/health") {
        response = healthCheck();
      } else if (pathname === "/v1/api/get-stock") {
        const quotesService = createQuotesService(loggedEnv, logger);
        const db = new D1DatabaseWrapper(loggedEnv.stockly, logger);
        const controller = new QuotesController(quotesService, logger, loggedEnv, db);
        response = await controller.getStock(request, ctx);
      } else if (pathname === "/v1/api/get-stocks") {
        const quotesService = createQuotesService(loggedEnv, logger);
        const db = new D1DatabaseWrapper(loggedEnv.stockly, logger);
        const controller = new QuotesController(quotesService, logger, loggedEnv, db);
        response = await controller.getStocks(request);
      } else if (pathname === "/v1/api/get-stock-details") {
        const stockService = createStockService(loggedEnv, logger);
        const controller = new StockController(stockService, logger, loggedEnv);
        const symbol = url.searchParams.get("symbol");
        if (!symbol) {
          response = createErrorResponse("INVALID_INPUT", "symbol parameter required", undefined, 400, request).response;
        } else {
          response = await controller.getStockDetails(request, symbol);
        }
      } else if (pathname.startsWith("/v1/api/stocks/") && pathname.endsWith("/executives") && request.method === "GET") {
        const stockService = createStockService(loggedEnv, logger);
        const controller = new StockController(stockService, logger, loggedEnv);
        const symbol = pathname.replace("/v1/api/stocks/", "").replace("/executives", "");
        response = await controller.getKeyExecutives(request, symbol);
      } else if (pathname.startsWith("/v1/api/stocks/") && pathname.endsWith("/analyst-estimates") && request.method === "GET") {
        const stockService = createStockService(loggedEnv, logger);
        const controller = new StockController(stockService, logger, loggedEnv);
        const symbol = pathname.replace("/v1/api/stocks/", "").replace("/analyst-estimates", "");
        response = await controller.getAnalystEstimates(request, symbol);
      } else if (pathname.startsWith("/v1/api/stocks/") && pathname.endsWith("/financial-growth") && request.method === "GET") {
        const stockService = createStockService(loggedEnv, logger);
        const controller = new StockController(stockService, logger, loggedEnv);
        const symbol = pathname.replace("/v1/api/stocks/", "").replace("/financial-growth", "");
        response = await controller.getFinancialGrowth(request, symbol);
      } else if (pathname.startsWith("/v1/api/stocks/") && pathname.endsWith("/dcf") && request.method === "GET") {
        const stockService = createStockService(loggedEnv, logger);
        const controller = new StockController(stockService, logger, loggedEnv);
        const symbol = pathname.replace("/v1/api/stocks/", "").replace("/dcf", "");
        response = await controller.getDCF(request, symbol);
      } else if (pathname.startsWith("/v1/api/stocks/") && pathname.endsWith("/financial-scores") && request.method === "GET") {
        const stockService = createStockService(loggedEnv, logger);
        const controller = new StockController(stockService, logger, loggedEnv);
        const symbol = pathname.replace("/v1/api/stocks/", "").replace("/financial-scores", "");
        response = await controller.getFinancialScores(request, symbol);
      } else if (pathname === "/v1/api/get-news") {
        const newsService = createNewsService(loggedEnv, logger);
        const controller = new NewsController(newsService, logger, loggedEnv);
        response = await controller.getNews(request);
      } else if (pathname === "/v1/api/news/general") {
        const newsService = createNewsService(loggedEnv, logger);
        const controller = new NewsController(newsService, logger, loggedEnv);
        response = await controller.getGeneralNews(request);
      } else if (pathname === "/v1/api/news/favorites") {
        const newsService = createNewsService(loggedEnv, logger);
        const controller = new NewsController(newsService, logger, loggedEnv);
        response = await controller.getFavoriteNews(request);
      } else if (pathname === "/v1/api/get-stock-news") {
        const newsService = createNewsService(loggedEnv, logger);
        const controller = new NewsController(newsService, logger, loggedEnv);
        response = await controller.getStockNews(request);
      } else if (pathname === "/v1/api/search-stock") {
        const searchService = createSearchService(loggedEnv, logger);
        const controller = new SearchController(searchService, logger, loggedEnv);
        response = await controller.searchStock(request);
      } else if (pathname === "/v1/api/get-historical") {
        const historicalService = createHistoricalService(loggedEnv, logger);
        const controller = new HistoricalController(historicalService, logger, loggedEnv);
        response = await controller.getHistorical(request, ctx);
      } else if (pathname === "/v1/api/get-historical-intraday") {
        const historicalService = createHistoricalService(loggedEnv, logger);
        const controller = new HistoricalController(historicalService, logger, loggedEnv);
        response = await controller.getHistoricalIntraday(request);
      } else if (pathname.startsWith("/v1/api/alerts")) {
        const alertService = createAlertService(loggedEnv, logger);
        const controller = new AlertController(alertService, logger, loggedEnv);
        
        const url = new URL(request.url);
        const pathSegments = url.pathname.slice("/v1/api/alerts".length).split("/").filter(Boolean);
        const alertId = pathSegments[0];

        if (request.method === "GET" && !alertId) {
          response = await controller.listAlerts(request);
        } else if (request.method === "GET" && alertId) {
          response = await controller.getAlert(request, alertId);
        } else if (request.method === "POST" && !alertId) {
          response = await controller.createAlert(request);
        } else if (request.method === "PUT" && alertId) {
          response = await controller.updateAlert(request, alertId);
        } else if (request.method === "DELETE" && alertId) {
          response = await controller.deleteAlert(request, alertId);
        } else {
          response = createErrorResponse("METHOD_NOT_ALLOWED", "Method not allowed", undefined, 405, request).response;
        }
      } else if (pathname === "/v1/api/push-token" && request.method === "GET") {
        response = await getPushToken(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/push-token" && request.method === "POST") {
        response = await registerPushToken(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/preferences" && request.method === "GET") {
        const preferencesService = createPreferencesService(loggedEnv, logger);
        const controller = new PreferencesController(preferencesService, logger, loggedEnv);
        response = await controller.getPreferences(request);
      } else if (pathname === "/v1/api/preferences" && request.method === "PUT") {
        const preferencesService = createPreferencesService(loggedEnv, logger);
        const controller = new PreferencesController(preferencesService, logger, loggedEnv);
        response = await controller.updatePreferences(request);
      } else if (pathname === "/v1/api/settings" && request.method === "GET") {
        const settingsService = createSettingsService(loggedEnv, logger);
        const controller = new SettingsController(settingsService, logger, loggedEnv);
        response = await controller.getSettings(request);
      } else if (pathname === "/v1/api/settings" && request.method === "PUT") {
        const settingsService = createSettingsService(loggedEnv, logger);
        const controller = new SettingsController(settingsService, logger, loggedEnv);
        response = await controller.updateSettings(request);
      } else if (pathname === "/v1/api/users/preferences/update" && request.method === "POST") {
        response = await updateUserPreferences(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/news/archive" && request.method === "GET") {
        response = await getArchivedNews(request, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/news/archive/") && request.method === "POST") {
        const articleId = pathname.split("/v1/api/news/archive/")[1];
        response = await toggleArchivedNews(request, articleId, loggedEnv, logger);
      } else if (pathname === "/v1/api/favorite-stocks" && request.method === "GET") {
        const favoriteStocksService = createFavoriteStocksService(loggedEnv, logger);
        const controller = new FavoriteStocksController(favoriteStocksService, logger, loggedEnv);
        response = await controller.getFavoriteStocks(request);
      } else if (pathname === "/v1/api/favorite-stocks" && request.method === "POST") {
        const favoriteStocksService = createFavoriteStocksService(loggedEnv, logger);
        const controller = new FavoriteStocksController(favoriteStocksService, logger, loggedEnv);
        response = await controller.updateFavoriteStocks(request);
      } else if (pathname.startsWith("/v1/api/favorite-stocks/") && request.method === "DELETE") {
        const symbol = pathname.split("/v1/api/favorite-stocks/")[1];
        const favoriteStocksService = createFavoriteStocksService(loggedEnv, logger);
        const controller = new FavoriteStocksController(favoriteStocksService, logger, loggedEnv);
        response = await controller.deleteFavoriteStock(request, symbol);
      } else if (pathname.startsWith("/v1/api/senate-trading")) {
        const senateTradingController = new SenateTradingController(loggedEnv, logger);
        response = await senateTradingController.handleRequest(request);
      } else if (pathname === "/v1/api/users/all" && request.method === "GET") {
        response = await getAllUsers(request, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/users/") && request.method === "GET") {
        // Handle /v1/api/users/:username and nested routes
        const userPath = pathname.replace("/v1/api/users/", "");
        const pathParts = userPath.split("/");
        const username = decodeURIComponent(pathParts[0]);
        
        if (pathParts.length === 1) {
          // /v1/api/users/:username
          response = await getUserByUsername(request, username, loggedEnv, logger);
        } else if (pathParts.length === 2) {
          // /v1/api/users/:username/:resource
          const resource = pathParts[1];
          if (resource === "devices") {
            response = await getUserDevices(request, username, loggedEnv, logger);
          } else if (resource === "alerts") {
            response = await getUserAlerts(request, username, loggedEnv, logger);
          } else if (resource === "favorite-stocks") {
            response = await getUserFavoriteStocks(request, username, loggedEnv, logger);
          } else {
            response = json({ error: "Invalid resource" }, 404, request);
          }
        } else {
          response = json({ error: "Invalid path" }, 404, request);
        }
      } else if (pathname === "/v1/api/notifications/recent") {
        response = await getRecentNotifications(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/notifications/failed") {
        response = await getFailedNotifications(request, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/notifications/retry/")) {
        if (request.method !== "POST") {
          response = json({ error: "Method not allowed" }, 405, request);
        } else {
          const logId = pathname.split("/v1/api/notifications/retry/")[1];
          response = await retryNotification(request, logId, loggedEnv, logger);
        }
      } else if (pathname === "/v1/api/devices" && request.method === "GET") {
        response = await getAllDevices(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/devices/test" && request.method === "POST") {
        response = await sendTestNotification(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/devices" && request.method === "DELETE") {
        response = await deleteDevice(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/admin/common-stocks" && request.method === "GET") {
        const commonStocksService = createCommonStocksService(loggedEnv, logger);
        const controller = new CommonStocksController(commonStocksService, logger, loggedEnv);
        response = await controller.getCommonStocks(request);
      } else if (pathname === "/v1/api/admin/common-stocks" && request.method === "POST") {
        const commonStocksService = createCommonStocksService(loggedEnv, logger);
        const controller = new CommonStocksController(commonStocksService, logger, loggedEnv);
        response = await controller.addCommonStock(request);
      } else if (pathname === "/v1/api/admin/common-stocks/bulk" && request.method === "POST") {
        const commonStocksService = createCommonStocksService(loggedEnv, logger);
        const controller = new CommonStocksController(commonStocksService, logger, loggedEnv);
        response = await controller.bulkAddCommonStocks(request);
      } else if (pathname.startsWith("/v1/api/admin/common-stocks/") && request.method === "PUT") {
        const symbol = pathname.split("/v1/api/admin/common-stocks/")[1];
        const commonStocksService = createCommonStocksService(loggedEnv, logger);
        const controller = new CommonStocksController(commonStocksService, logger, loggedEnv);
        response = await controller.updateCommonStock(request, symbol);
      } else if (pathname.startsWith("/v1/api/admin/common-stocks/") && request.method === "DELETE") {
        const symbol = pathname.split("/v1/api/admin/common-stocks/")[1];
        const commonStocksService = createCommonStocksService(loggedEnv, logger);
        const controller = new CommonStocksController(commonStocksService, logger, loggedEnv);
        response = await controller.deleteCommonStock(request, symbol);
      } else if (pathname === "/v1/api/admin/datalakes" && request.method === "GET") {
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.getAllDatalakes(request);
      } else if (pathname === "/v1/api/admin/datalakes" && request.method === "POST") {
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.createDatalake(request);
      } else if (pathname.startsWith("/v1/api/admin/datalakes/") && pathname.split("/").length === 5 && request.method === "GET") {
        const id = pathname.split("/v1/api/admin/datalakes/")[1];
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.getDatalake(request, id);
      } else if (pathname.startsWith("/v1/api/admin/datalakes/") && pathname.split("/").length === 5 && request.method === "PUT") {
        const id = pathname.split("/v1/api/admin/datalakes/")[1];
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.updateDatalake(request, id);
      } else if (pathname.startsWith("/v1/api/admin/datalakes/") && pathname.split("/").length === 5 && request.method === "DELETE") {
        const id = pathname.split("/v1/api/admin/datalakes/")[1];
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.deleteDatalake(request, id);
      } else if (pathname === "/v1/api/admin/api-endpoints" && request.method === "GET") {
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.getAllApiEndpoints(request);
      } else if (pathname.startsWith("/v1/api/admin/api-endpoints/") && pathname.endsWith("/mappings") && request.method === "GET") {
        const endpointId = pathname.split("/v1/api/admin/api-endpoints/")[1].replace("/mappings", "");
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.getEndpointMappings(request, endpointId);
      } else if (pathname.startsWith("/v1/api/admin/api-endpoints/") && pathname.endsWith("/select-datalake") && request.method === "PUT") {
        const endpointId = pathname.split("/v1/api/admin/api-endpoints/")[1].replace("/select-datalake", "");
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.selectDatalakeForEndpoint(request, endpointId);
      } else if (pathname.startsWith("/v1/api/admin/datalakes/") && pathname.endsWith("/mappings") && request.method === "GET") {
        const datalakeId = pathname.split("/v1/api/admin/datalakes/")[1].replace("/mappings", "");
        const datalakeService = createDatalakeService(loggedEnv, logger);
        const controller = new DatalakeController(datalakeService, logger, loggedEnv);
        response = await controller.getDatalakeMappings(request, datalakeId);
      } else if (pathname === "/config/get" && request.method === "GET") {
        response = await getConfigEndpoint(loggedEnv, logger);
      } else if (pathname === "/config/update" && request.method === "POST") {
        response = await updateConfigEndpoint(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/simulate-provider-failure" && request.method === "POST") {
        response = await simulateProviderFailureEndpoint(loggedEnv, logger);
      } else if (pathname === "/v1/api/disable-provider-failure" && request.method === "POST") {
        response = await disableProviderFailureEndpoint(loggedEnv, logger);
      } else if (pathname === "/v1/api/auth/google" && request.method === "POST") {
        response = await handleGoogleAuth(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/auth/username/check" && request.method === "GET") {
        response = await checkUsernameAvailability(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/auth/username" && request.method === "POST") {
        response = await setUsername(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/auth/refresh" && request.method === "POST") {
        response = await refreshToken(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/auth/me" && request.method === "GET") {
        response = await getCurrentUser(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/users/profile" && request.method === "GET") {
        const userService = createUserService(loggedEnv, logger);
        const controller = new UserController(userService, logger, loggedEnv);
        response = await controller.getProfile(request);
      } else if (pathname === "/v1/api/users/profile" && request.method === "PUT") {
        const userService = createUserService(loggedEnv, logger);
        const controller = new UserController(userService, logger, loggedEnv);
        response = await controller.updateProfile(request);
      } else if (pathname === "/v1/api/auth/logout" && request.method === "POST") {
        response = await logout(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/market/gainers" && request.method === "GET") {
        const marketService = createMarketService(loggedEnv, logger);
        const controller = new MarketController(marketService, logger, loggedEnv);
        response = await controller.getGainers(request);
      } else if (pathname === "/v1/api/market/losers" && request.method === "GET") {
        const marketService = createMarketService(loggedEnv, logger);
        const controller = new MarketController(marketService, logger, loggedEnv);
        response = await controller.getLosers(request);
      } else if (pathname === "/v1/api/market/actives" && request.method === "GET") {
        const marketService = createMarketService(loggedEnv, logger);
        const controller = new MarketController(marketService, logger, loggedEnv);
        response = await controller.getActives(request);
      } else if (pathname === "/v1/api/market/screener" && request.method === "GET") {
        const marketService = createMarketService(loggedEnv, logger);
        const controller = new MarketController(marketService, logger, loggedEnv);
        response = await controller.getScreener(request);
      } else if (pathname === "/v1/api/market/sectors-performance" && request.method === "GET") {
        const marketService = createMarketService(loggedEnv, logger);
        const controller = new MarketController(marketService, logger, loggedEnv);
        response = await controller.getSectorsPerformance(request);
      } else if (pathname === "/v1/api/market/status" && request.method === "GET") {
        const marketService = createMarketService(loggedEnv, logger);
        const controller = new MarketController(marketService, logger, loggedEnv);
        response = await controller.getMarketStatus(request);
      } else if (pathname === "/v1/api/market/social-sentiment" && request.method === "GET") {
        const marketService = createMarketService(loggedEnv, logger);
        const controller = new MarketController(marketService, logger, loggedEnv);
        response = await controller.getSocialSentiment(request);
      } else if (pathname === "/v1/api/market/crypto" && request.method === "GET") {
        const marketService = createMarketService(loggedEnv, logger);
        const controller = new MarketController(marketService, logger, loggedEnv);
        response = await controller.getCryptoQuotes(request);
      } else if (pathname === "/v1/api/dividends/data" && request.method === "GET") {
        const dividendService = createDividendService(loggedEnv, logger);
        const controller = new DividendController(dividendService, logger, loggedEnv);
        response = await controller.getDividendData(request);
      } else if (pathname === "/v1/api/dividends/project" && request.method === "POST") {
        const dividendService = createDividendService(loggedEnv, logger);
        const controller = new DividendController(dividendService, logger, loggedEnv);
        response = await controller.calculateProjection(request);
      } else if (pathname === "/v1/api/calendar/earnings" && request.method === "GET") {
        const calendarService = createCalendarService(loggedEnv, logger);
        const controller = new CalendarController(calendarService, logger, loggedEnv);
        response = await controller.getEarningsCalendar(request);
      } else if (pathname === "/v1/api/calendar/dividends" && request.method === "GET") {
        const calendarService = createCalendarService(loggedEnv, logger);
        const controller = new CalendarController(calendarService, logger, loggedEnv);
        response = await controller.getDividendCalendar(request);
      } else if (pathname === "/v1/api/calendar/ipos" && request.method === "GET") {
        const calendarService = createCalendarService(loggedEnv, logger);
        const controller = new CalendarController(calendarService, logger, loggedEnv);
        response = await controller.getIPOCalendar(request);
      } else if (pathname === "/v1/api/calendar/splits" && request.method === "GET") {
        const calendarService = createCalendarService(loggedEnv, logger);
        const controller = new CalendarController(calendarService, logger, loggedEnv);
        response = await controller.getStockSplitCalendar(request);
      } else {
        logger.warn("Route not found", { pathname, method: request.method });
        response = json({ error: "Not Found" }, 404, request);
      }
    } catch (error) {
      logger.error("Unhandled error in fetch handler", error, {
        pathname,
        method: request.method,
      });
      response = json({ error: "Internal Server Error" }, 500, request);
    }

    // Ship logs asynchronously (non-blocking) - this happens after response is ready
    if (env.LOKI_URL) {
      ctx.waitUntil(
        sendLogsToLoki(logger.getLogs(), {
          url: env.LOKI_URL,
          username: env.LOKI_USERNAME,
          password: env.LOKI_PASSWORD,
        })
      );
    }

    return response;
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Check working hours before running any cron job
    const config = await getConfig(env);
    if (!isWithinWorkingHours(config)) {
      const logger = new Logger({
        traceId: `cron-${Date.now()}`,
        userId: null,
        path: '/cron',
        service: 'stockly-api',
      });
      logger.info('Skipping cron job - outside working hours', {
        cron: event.cron,
        workingHours: config.workingHours,
      });
      return;
    }

    // Run price alerts every 5 minutes (default cron)
    if (event.cron === "*/5 * * * *" || !event.cron) {
      ctx.waitUntil(runAlertCron(env, ctx));
    }

    // Run news alerts every 6 hours (at 00:00, 06:00, 12:00, 18:00)
    if (event.cron === "0 */6 * * *") {
      ctx.waitUntil(runNewsAlertCron(env, ctx));
    }

    // Run senate trading sync and alerts every 6 hours (at 00:00, 06:00, 12:00, 18:00)
    // Note: Using same schedule as news alerts, but could be separate
    if (event.cron === "0 */6 * * *") {
      ctx.waitUntil(runSenateTradingCron(env, ctx));
    }

    // Run market data & news prefetch every 1 hour (hourly) to warm cache
    // The actual interval is configurable via AdminConfig, but wrangler.jsonc needs a valid cron expression
    // This ensures cache is always fresh when users request data
    if (event.cron === "0 * * * *") {
      ctx.waitUntil(runMarketPrefetchCron(env, ctx));
    }
  },
};
