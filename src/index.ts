import { json, CORS_HEADERS, getCorsHeaders } from "./util";
import { getStock } from "./api/get-stock";
import { getStocks } from "./api/get-stocks";
import { getStockDetailsRoute } from "./api/get-stock-details";
import { getNews, getGeneralNews, getFavoriteNews } from "./api/get-news";
import { getStockNews } from "./api/get-stock-news";
import { searchStock } from "./api/search-stock";
import { healthCheck } from "./api/health";
import { handleAlertsRequest } from "./api/alerts";
import { registerPushToken, getPushToken } from "./api/push-token";
import { getPreferences, updatePreferences } from "./api/preferences";
import { getSettings, updateSettings } from "./api/settings";
import { getRecentNotifications, getFailedNotifications, retryNotification } from "./api/admin";
import { getAllDevices, sendTestNotification, deleteDevice } from "./api/devices";
import { updateUserPreferences } from "./api/user-preferences";
import { getArchivedNews, toggleArchivedNews } from "./api/news-archive";
import { getFavoriteStocks, updateFavoriteStocks, deleteFavoriteStock } from "./api/favorite-stocks";
import { getAllUsers, getUserByUsername, getUserDevices, getUserAlerts, getUserFavoriteStocks } from "./api/users";
import { runAlertCron } from "./cron/alerts-cron";
import { runNewsAlertCron } from "./cron/news-alert-cron";
import { getHistorical } from "./api/get-historical";
import { getHistoricalIntraday } from "./api/get-historical-intraday";
import { getOpenApiSpec } from "./api/openapi";
import {
  getConfigEndpoint,
  updateConfigEndpoint,
  simulateProviderFailureEndpoint,
  disableProviderFailureEndpoint,
} from "./api/config";
import {
  handleGoogleAuth,
  checkUsernameAvailability,
  setUsername,
  refreshToken,
  logout,
  getCurrentUser,
} from "./api/auth";
import { Logger, extractUserId } from "./logging/logger";
import { sendLogsToLoki } from "./logging/loki-shipper";
import { LoggedD1Database } from "./logging/d1-wrapper";
import { LoggedKVNamespace } from "./logging/kv-wrapper";

export interface Env {
  stockly: D1Database;
  alertsKv?: KVNamespace;
  FCM_SERVICE_ACCOUNT?: string; // Google Cloud Service Account JSON as string
  FMP_API_KEY?: string; // Financial Modeling Prep API key (optional, falls back to hardcoded in util.ts)
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

    let response: Response;

    try {
      if (pathname === "/openapi.json") {
        response = await getOpenApiSpec();
      } else if (pathname === "/v1/api/health") {
        response = healthCheck();
      } else if (pathname === "/v1/api/get-stock") {
        response = await getStock(request, url, loggedEnv, ctx, logger);
      } else if (pathname === "/v1/api/get-stocks") {
        response = await getStocks(request, url, loggedEnv, logger);
      } else if (pathname === "/v1/api/get-stock-details") {
        response = await getStockDetailsRoute(request, url, loggedEnv, ctx, logger);
      } else if (pathname === "/v1/api/get-news") {
        response = await getNews(request, url, loggedEnv, logger);
      } else if (pathname === "/v1/api/news/general") {
        response = await getGeneralNews(request, url, loggedEnv, logger);
      } else if (pathname === "/v1/api/news/favorites") {
        response = await getFavoriteNews(request, url, loggedEnv, logger);
      } else if (pathname === "/v1/api/get-stock-news") {
        response = await getStockNews(request, url, loggedEnv, logger);
      } else if (pathname === "/v1/api/search-stock") {
        response = await searchStock(request, url, loggedEnv, logger);
      } else if (pathname === "/v1/api/get-historical") {
        response = await getHistorical(request, url, loggedEnv, ctx, logger);
      } else if (pathname === "/v1/api/get-historical-intraday") {
        response = await getHistoricalIntraday(request, url, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/alerts")) {
        response = await handleAlertsRequest(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/push-token" && request.method === "GET") {
        response = await getPushToken(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/push-token" && request.method === "POST") {
        response = await registerPushToken(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/preferences" && request.method === "GET") {
        response = await getPreferences(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/preferences" && request.method === "PUT") {
        response = await updatePreferences(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/settings" && request.method === "GET") {
        response = await getSettings(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/settings" && request.method === "PUT") {
        response = await updateSettings(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/users/preferences/update" && request.method === "POST") {
        response = await updateUserPreferences(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/news/archive" && request.method === "GET") {
        response = await getArchivedNews(request, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/news/archive/") && request.method === "POST") {
        const articleId = pathname.split("/v1/api/news/archive/")[1];
        response = await toggleArchivedNews(request, articleId, loggedEnv, logger);
      } else if (pathname === "/v1/api/favorite-stocks" && request.method === "GET") {
        response = await getFavoriteStocks(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/favorite-stocks" && request.method === "POST") {
        response = await updateFavoriteStocks(request, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/favorite-stocks/") && request.method === "DELETE") {
        const symbol = pathname.split("/v1/api/favorite-stocks/")[1];
        response = await deleteFavoriteStock(request, symbol, loggedEnv, logger);
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
      } else if (pathname === "/v1/api/auth/logout" && request.method === "POST") {
        response = await logout(request, loggedEnv, logger);
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
    // Run price alerts every 5 minutes (default cron)
    if (event.cron === "*/5 * * * *" || !event.cron) {
      ctx.waitUntil(runAlertCron(env, ctx));
    }

    // Run news alerts every 6 hours (at 00:00, 06:00, 12:00, 18:00)
    if (event.cron === "0 */6 * * *") {
      ctx.waitUntil(runNewsAlertCron(env, ctx));
    }
  },
};
