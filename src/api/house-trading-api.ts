/**
 * API endpoints for House Trading
 * Handles HTTP requests for house trading feed
 */

import { json } from "../util";
import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import { createHouseTradingService } from "../factories/createHouseTradingService";
import type {
  HouseTradingFilter,
} from "../house-trading/types";

/**
 * GET /v1/api/house-trading/feed
 * Get house trading feed with optional filters
 */
export async function getHouseTradingFeed(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const url = new URL(request.url);
    let symbol = url.searchParams.get("symbol") || undefined;
    let representativeName = url.searchParams.get("representativeName") || undefined;
    const transactionType = url.searchParams.get("transactionType") || undefined;
    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    // Validate and normalize symbol
    if (symbol) {
      symbol = symbol.trim().toUpperCase();
      if (symbol.length === 0 || symbol.length > 10) {
        return json({ error: "Invalid symbol format" }, 400, request);
      }
      // Basic symbol validation (alphanumeric only)
      if (!/^[A-Z0-9]+$/.test(symbol)) {
        return json({ error: "Symbol must contain only letters and numbers" }, 400, request);
      }
    }

    // Validate and normalize representativeName
    if (representativeName) {
      representativeName = representativeName.trim();
      if (representativeName.length === 0 || representativeName.length > 200) {
        return json({ error: "Invalid representative name" }, 400, request);
      }
    }

    // Validate transactionType
    if (transactionType && !["Purchase", "Sale", "Exchange"].includes(transactionType)) {
      return json({ error: "transactionType must be one of: Purchase, Sale, Exchange" }, 400, request);
    }

    // Validate date formats
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return json({ error: "startDate must be in YYYY-MM-DD format" }, 400, request);
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return json({ error: "endDate must be in YYYY-MM-DD format" }, 400, request);
    }

    // Validate limit and offset
    if (isNaN(limit) || limit < 1) {
      return json({ error: "limit must be a positive number" }, 400, request);
    }
    if (isNaN(offset) || offset < 0) {
      return json({ error: "offset must be a non-negative number" }, 400, request);
    }

    const filters: HouseTradingFilter = {
      symbol,
      representativeName,
      transactionType: transactionType as any,
      startDate,
      endDate,
      limit: Math.min(limit, 1000), // Cap at 1000
      offset,
    };

    const houseService = createHouseTradingService(env, logger);
    const trades = await houseService.getTradesFeed(filters);

    return json({ trades }, 200, request);
  } catch (error) {
    logger.error("Error getting house trading feed", error);
    return json({ error: "Failed to fetch house trading feed" }, 500, request);
  }
}

/**
 * GET /v1/api/house-trading/representatives
 * Get list of all unique representatives
 */
export async function getRepresentativesList(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const houseService = createHouseTradingService(env, logger);
    const representatives = await houseService.getRepresentativesList();

    return json({ representatives }, 200, request);
  } catch (error) {
    logger.error("Error getting representatives list", error);
    return json({ error: "Failed to fetch representatives list" }, 500, request);
  }
}

/**
 * GET /v1/api/house-trading/representatives/popular
 * Get popular representatives by trades
 * Query params: ?limit=10
 */
export async function getPopularRepresentatives(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return json({ error: "limit must be between 1 and 50" }, 400, request);
    }

    const houseService = createHouseTradingService(env, logger);
    const popular = await houseService.getPopularRepresentativesByTrades(limit);

    return json({ representatives: popular }, 200, request);
  } catch (error) {
    logger.error("Error getting popular representatives", error);
    return json({ error: "Failed to fetch popular representatives" }, 500, request);
  }
}

/**
 * GET /v1/api/house-trading/representatives/autocomplete
 * Search representatives by name (autocomplete)
 * Query params: ?query=...&limit=20
 */
export async function searchRepresentativesAutocomplete(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") || "";
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return json({ error: "limit must be between 1 and 50" }, 400, request);
    }

    // Validate query
    if (query.trim().length < 1) {
      return json({ representatives: [] }, 200, request);
    }

    const houseService = createHouseTradingService(env, logger);
    const representatives = await houseService.searchRepresentatives(query, limit);

    return json({ representatives }, 200, request);
  } catch (error) {
    logger.error("Error searching representatives", error);
    return json({ error: "Failed to search representatives" }, 500, request);
  }
}

