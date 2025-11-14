import { json, CORS_HEADERS } from "./util";
import { getStock } from "./api/get-stock";
import { getStocks } from "./api/get-stocks";
import { searchStock } from "./api/search-stock";
import { healthCheck } from "./api/health";

export interface Env {
  stockly: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    if (pathname === "/v1/api/health") {
      return healthCheck();
    }

    if (pathname === "/v1/api/get-stock") {
      return await getStock(url, env);
    }

    if (pathname === "/v1/api/get-stocks") {
      return await getStocks(url, env);
    }

    if (pathname === "/v1/api/search-stock") {
      return await searchStock(url, env);
    }

    return json({ error: "Not Found" }, 404);
  },
};
