import { json, CORS_HEADERS } from "./util";
import { getStock } from "./api/get-stock";
import { getStocks } from "./api/get-stocks";
import { getStockDetailsRoute } from "./api/get-stock-details";
import { getNews } from "./api/get-news";
import { getStockNews } from "./api/get-stock-news";
import { searchStock } from "./api/search-stock";
import { healthCheck } from "./api/health";
import { handleAlertsRequest } from "./api/alerts";
import { registerPushToken, getPushToken } from "./api/push-token";
import { getPreferences, updatePreferences } from "./api/preferences";
import { getSettings, updateSettings } from "./api/settings";
import { getRecentNotifications, getFailedNotifications, retryNotification } from "./api/admin";
import { getAllDevices, sendTestNotification, deleteDevice } from "./api/devices";
import { runAlertCron } from "./cron/alerts-cron";
import { getHistorical } from "./api/get-historical";
import { getHistoricalIntraday } from "./api/get-historical-intraday";
import { getOpenApiSpec } from "./api/openapi";
import {
  getConfigEndpoint,
  updateConfigEndpoint,
  simulateProviderFailureEndpoint,
  disableProviderFailureEndpoint,
} from "./api/config";
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

      // Build response headers with defaults
      const headers: HeadersInit = {
        ...CORS_HEADERS,
      };

      // Echo back the requested headers if provided (browsers can be strict about header matching)
      // Some browsers require an exact match or superset of requested headers
      if (requestedHeaders) {
        // Merge requested headers with our default allowed headers
        // This ensures we allow everything the browser is requesting
        const defaultHeadersList = CORS_HEADERS["Access-Control-Allow-Headers"].split(", ").map(h => h.trim());
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
        response = await getStock(url, loggedEnv, ctx, logger);
      } else if (pathname === "/v1/api/get-stocks") {
        response = await getStocks(url, loggedEnv, logger);
      } else if (pathname === "/v1/api/get-stock-details") {
        response = await getStockDetailsRoute(url, loggedEnv, ctx, logger);
      } else if (pathname === "/v1/api/get-news") {
        response = await getNews(url, loggedEnv, logger);
      } else if (pathname === "/v1/api/get-stock-news") {
        response = await getStockNews(url, loggedEnv, logger);
      } else if (pathname === "/v1/api/search-stock") {
        response = await searchStock(url, loggedEnv, logger);
      } else if (pathname === "/v1/api/get-historical") {
        response = await getHistorical(url, loggedEnv, ctx, logger);
      } else if (pathname === "/v1/api/get-historical-intraday") {
        response = await getHistoricalIntraday(url, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/alerts")) {
        response = await handleAlertsRequest(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/push-token") {
        response = await registerPushToken(request, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/push-token/")) {
        const extractedUserId = pathname.split("/v1/api/push-token/")[1];
        logger.updateContext({ userId: extractedUserId });
        response = await getPushToken(extractedUserId, loggedEnv, logger);
      } else if (pathname === "/v1/api/preferences" && request.method === "PUT") {
        response = await updatePreferences(request, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/preferences/")) {
        const extractedUserId = pathname.split("/v1/api/preferences/")[1];
        logger.updateContext({ userId: extractedUserId });
        response = await getPreferences(extractedUserId, loggedEnv, logger);
      } else if (pathname === "/v1/api/settings" && request.method === "PUT") {
        response = await updateSettings(request, loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/settings/")) {
        const extractedUserId = pathname.split("/v1/api/settings/")[1];
        logger.updateContext({ userId: extractedUserId });
        response = await getSettings(extractedUserId, loggedEnv, logger);
      } else if (pathname === "/v1/api/notifications/recent") {
        response = await getRecentNotifications(loggedEnv, logger);
      } else if (pathname === "/v1/api/notifications/failed") {
        response = await getFailedNotifications(loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/notifications/retry/")) {
        if (request.method !== "POST") {
          response = json({ error: "Method not allowed" }, 405);
        } else {
          const logId = pathname.split("/v1/api/notifications/retry/")[1];
          response = await retryNotification(logId, loggedEnv, logger);
        }
      } else if (pathname === "/v1/api/devices") {
        response = await getAllDevices(loggedEnv, logger);
      } else if (pathname.startsWith("/v1/api/devices/")) {
        const pathAfterDevices = pathname.split("/v1/api/devices/")[1];

        if (pathAfterDevices.endsWith("/test")) {
          // POST /v1/api/devices/:userId/test
          const extractedUserId = pathAfterDevices.replace("/test", "");
          logger.updateContext({ userId: extractedUserId });
          response = await sendTestNotification(extractedUserId, request, loggedEnv, logger);
        } else if (request.method === "DELETE") {
          // DELETE /v1/api/devices/:userId
          const extractedUserId = pathAfterDevices;
          logger.updateContext({ userId: extractedUserId });
          response = await deleteDevice(extractedUserId, loggedEnv, logger);
        } else {
          response = json({ error: "Not Found" }, 404);
        }
      } else if (pathname === "/config/get" && request.method === "GET") {
        response = await getConfigEndpoint(loggedEnv, logger);
      } else if (pathname === "/config/update" && request.method === "POST") {
        response = await updateConfigEndpoint(request, loggedEnv, logger);
      } else if (pathname === "/v1/api/simulate-provider-failure" && request.method === "POST") {
        response = await simulateProviderFailureEndpoint(loggedEnv, logger);
      } else if (pathname === "/v1/api/disable-provider-failure" && request.method === "POST") {
        response = await disableProviderFailureEndpoint(loggedEnv, logger);
      } else {
        logger.warn("Route not found", { pathname, method: request.method });
        response = json({ error: "Not Found" }, 404);
      }
    } catch (error) {
      logger.error("Unhandled error in fetch handler", error, {
        pathname,
        method: request.method,
      });
      response = json({ error: "Internal Server Error" }, 500);
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
    ctx.waitUntil(runAlertCron(env, ctx));
  },
};
