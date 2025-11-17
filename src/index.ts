import { json, CORS_HEADERS } from "./util";
import { getStock } from "./api/get-stock";
import { getStocks } from "./api/get-stocks";
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
import { getOpenApiSpec } from "./api/openapi";
import {
  getConfigEndpoint,
  updateConfigEndpoint,
  simulateProviderFailureEndpoint,
  disableProviderFailureEndpoint,
} from "./api/config";

export interface Env {
  stockly: D1Database;
  alertsKv?: KVNamespace;
  FCM_SERVICE_ACCOUNT?: string; // Google Cloud Service Account JSON as string
  FMP_API_KEY?: string; // Financial Modeling Prep API key (optional, falls back to hardcoded in util.ts)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (pathname === "/openapi.json") {
      return await getOpenApiSpec();
    }

    if (pathname === "/v1/api/health") {
      return healthCheck();
    }

    if (pathname === "/v1/api/get-stock") {
      return await getStock(url, env, ctx);
    }

    if (pathname === "/v1/api/get-stocks") {
      return await getStocks(url, env);
    }

    if (pathname === "/v1/api/search-stock") {
      return await searchStock(url, env);
    }

    if (pathname === "/v1/api/get-historical") {
      return await getHistorical(url, env);
    }

    if (pathname.startsWith("/v1/api/alerts")) {
      return await handleAlertsRequest(request, env);
    }

    if (pathname === "/v1/api/push-token") {
      return await registerPushToken(request, env);
    }

    if (pathname.startsWith("/v1/api/push-token/")) {
      const userId = pathname.split("/v1/api/push-token/")[1];
      return await getPushToken(userId, env);
    }

    if (pathname === "/v1/api/preferences" && request.method === "PUT") {
      return await updatePreferences(request, env);
    }

    if (pathname.startsWith("/v1/api/preferences/")) {
      const userId = pathname.split("/v1/api/preferences/")[1];
      return await getPreferences(userId, env);
    }

    if (pathname === "/v1/api/settings" && request.method === "PUT") {
      return await updateSettings(request, env);
    }

    if (pathname.startsWith("/v1/api/settings/")) {
      const userId = pathname.split("/v1/api/settings/")[1];
      return await getSettings(userId, env);
    }

    if (pathname === "/v1/api/notifications/recent") {
      return await getRecentNotifications(env);
    }

    if (pathname === "/v1/api/notifications/failed") {
      return await getFailedNotifications(env);
    }

    if (pathname.startsWith("/v1/api/notifications/retry/")) {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }
      const logId = pathname.split("/v1/api/notifications/retry/")[1];
      return await retryNotification(logId, env);
    }

    if (pathname === "/v1/api/devices") {
      return await getAllDevices(env);
    }

    if (pathname.startsWith("/v1/api/devices/")) {
      const pathAfterDevices = pathname.split("/v1/api/devices/")[1];
      
      if (pathAfterDevices.endsWith("/test")) {
        // POST /v1/api/devices/:userId/test
        const userId = pathAfterDevices.replace("/test", "");
        return await sendTestNotification(userId, request, env);
      } else if (request.method === "DELETE") {
        // DELETE /v1/api/devices/:userId
        const userId = pathAfterDevices;
        return await deleteDevice(userId, env);
      }
    }

    // Config endpoints
    if (pathname === "/config/get" && request.method === "GET") {
      return await getConfigEndpoint(env);
    }

    if (pathname === "/config/update" && request.method === "POST") {
      return await updateConfigEndpoint(request, env);
    }

    // Provider failure simulation endpoints
    if (pathname === "/v1/api/simulate-provider-failure" && request.method === "POST") {
      return await simulateProviderFailureEndpoint(env);
    }

    if (pathname === "/v1/api/disable-provider-failure" && request.method === "POST") {
      return await disableProviderFailureEndpoint(env);
    }

    return json({ error: "Not Found" }, 404);
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runAlertCron(env));
  },
};
