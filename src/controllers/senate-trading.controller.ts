/**
 * Controller for Senate Trading API endpoints
 * Routes HTTP requests to appropriate handlers
 */

import type { Request } from "../index";
import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import {
  getSenateTradingFeed,
  getSenatorsList,
  getPopularSenators,
  searchSenatorsAutocomplete,
  getUserFollows,
  followSenator,
  unfollowSenator,
  updateFollowPreferences,
  getUserSenatorAlerts,
} from "../api/senate-trading-api";

export class SenateTradingController {
  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // GET /v1/api/senate-trading/feed
    if (pathname === "/v1/api/senate-trading/feed" && method === "GET") {
      return getSenateTradingFeed(request, this.env, this.logger);
    }

    // GET /v1/api/senate-trading/senators
    if (pathname === "/v1/api/senate-trading/senators" && method === "GET") {
      return getSenatorsList(request, this.env, this.logger);
    }

    // GET /v1/api/senate-trading/senators/popular
    if (pathname === "/v1/api/senate-trading/senators/popular" && method === "GET") {
      return getPopularSenators(request, this.env, this.logger);
    }

    // GET /v1/api/senate-trading/senators/autocomplete
    if (pathname === "/v1/api/senate-trading/senators/autocomplete" && method === "GET") {
      return searchSenatorsAutocomplete(request, this.env, this.logger);
    }

    // GET /v1/api/senate-trading/follows
    if (pathname === "/v1/api/senate-trading/follows" && method === "GET") {
      return getUserFollows(request, this.env, this.logger);
    }

    // POST /v1/api/senate-trading/follows
    if (pathname === "/v1/api/senate-trading/follows" && method === "POST") {
      return followSenator(request, this.env, this.logger);
    }

    // DELETE /v1/api/senate-trading/follows/:senatorName
    if (
      pathname.startsWith("/v1/api/senate-trading/follows/") &&
      method === "DELETE"
    ) {
      const senatorName = decodeURIComponent(
        pathname.split("/v1/api/senate-trading/follows/")[1]
      );
      return unfollowSenator(request, this.env, this.logger, senatorName);
    }

    // PUT /v1/api/senate-trading/follows/:senatorName
    if (
      pathname.startsWith("/v1/api/senate-trading/follows/") &&
      method === "PUT"
    ) {
      const senatorName = decodeURIComponent(
        pathname.split("/v1/api/senate-trading/follows/")[1]
      );
      return updateFollowPreferences(request, this.env, this.logger, senatorName);
    }

    // GET /v1/api/senate-trading/alerts
    if (pathname === "/v1/api/senate-trading/alerts" && method === "GET") {
      return getUserSenatorAlerts(request, this.env, this.logger);
    }

    // 404 for unmatched routes
    return new Response("Not Found", { status: 404 });
  }
}

