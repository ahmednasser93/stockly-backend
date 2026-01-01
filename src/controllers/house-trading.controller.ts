/**
 * Controller for House Trading API endpoints
 */

import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import {
  getHouseTradingFeed,
  getRepresentativesList,
  getPopularRepresentatives,
  searchRepresentativesAutocomplete,
} from "../api/house-trading-api";

export class HouseTradingController {
  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // GET /v1/api/house-trading/feed
    if (pathname === "/v1/api/house-trading/feed" && method === "GET") {
      return getHouseTradingFeed(request, this.env, this.logger);
    }

    // GET /v1/api/house-trading/representatives
    if (pathname === "/v1/api/house-trading/representatives" && method === "GET") {
      return getRepresentativesList(request, this.env, this.logger);
    }

    // GET /v1/api/house-trading/representatives/popular
    if (pathname === "/v1/api/house-trading/representatives/popular" && method === "GET") {
      return getPopularRepresentatives(request, this.env, this.logger);
    }

    // GET /v1/api/house-trading/representatives/autocomplete
    if (pathname === "/v1/api/house-trading/representatives/autocomplete" && method === "GET") {
      return searchRepresentativesAutocomplete(request, this.env, this.logger);
    }

    // No matching route
    return new Response("Not Found", { status: 404 });
  }
}

