/**
 * API endpoints for Senate Trading
 * Handles HTTP requests for senate trading feed, follows, and alerts
 */

import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";
import { createSenateTradingService } from "../factories/createSenateTradingService";
import type {
  SenateTradingFilter,
  SenatorFollowPreferences,
} from "../senate-trading/types";

/**
 * GET /v1/api/senate-trading/feed
 * Get senate trading feed with optional filters
 */
export async function getSenateTradingFeed(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const url = new URL(request.url);
    let symbol = url.searchParams.get("symbol") || undefined;
    let senatorName = url.searchParams.get("senatorName") || undefined;
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

    // Validate and normalize senatorName
    if (senatorName) {
      senatorName = senatorName.trim();
      if (senatorName.length === 0 || senatorName.length > 200) {
        return json({ error: "Invalid senator name" }, 400, request);
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

    const filters: SenateTradingFilter = {
      symbol,
      senatorName,
      transactionType: transactionType as any,
      startDate,
      endDate,
      limit: Math.min(limit, 1000), // Cap at 1000
      offset,
    };

    const senateService = createSenateTradingService(env, logger);
    const trades = await senateService.getTradesFeed(filters);

    return json({ trades }, 200, request);
  } catch (error) {
    logger.error("Error getting senate trading feed", error);
    return json({ error: "Failed to fetch senate trading feed" }, 500, request);
  }
}

/**
 * GET /v1/api/senate-trading/senators
 * Get list of all unique senators
 */
export async function getSenatorsList(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const senateService = createSenateTradingService(env, logger);
    const senators = await senateService.getSenatorsList();

    return json({ senators }, 200, request);
  } catch (error) {
    logger.error("Error getting senators list", error);
    return json({ error: "Failed to fetch senators list" }, 500, request);
  }
}

/**
 * GET /v1/api/senate-trading/senators/popular
 * Get popular senators (by trades or followers)
 * Query params: ?type=trades|followers&limit=10
 */
export async function getPopularSenators(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "trades"; // "trades" or "followers"
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return json({ error: "limit must be between 1 and 50" }, 400, request);
    }

    // Validate type
    if (type !== "trades" && type !== "followers") {
      return json({ error: "type must be 'trades' or 'followers'" }, 400, request);
    }

    const senateService = createSenateTradingService(env, logger);

    if (type === "trades") {
      const popular = await senateService.getPopularSenatorsByTrades(limit);
      return json({ senators: popular }, 200, request);
    } else {
      const popular = await senateService.getPopularSenatorsByFollowers(limit);
      return json({ senators: popular }, 200, request);
    }
  } catch (error) {
    logger.error("Error getting popular senators", error);
    return json({ error: "Failed to fetch popular senators" }, 500, request);
  }
}

/**
 * GET /v1/api/senate-trading/senators/autocomplete
 * Search senators by name (autocomplete)
 * Query params: ?query=...&limit=20
 */
export async function searchSenatorsAutocomplete(
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
      return json({ senators: [] }, 200, request);
    }

    const senateService = createSenateTradingService(env, logger);
    const senators = await senateService.searchSenators(query, limit);

    return json({ senators }, 200, request);
  } catch (error) {
    logger.error("Error searching senators", error);
    return json({ error: "Failed to search senators" }, 500, request);
  }
}

/**
 * GET /v1/api/senate-trading/follows
 * Get user's followed senators (requires authentication)
 */
export async function getUserFollows(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  const auth = await authenticateRequest(
    request,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Authentication required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  try {
    // Get user_id from username
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(auth.username)
      .first<{ id: string }>();

    if (!user) {
      const { response } = createErrorResponse(
        "USER_NOT_FOUND",
        "User not found",
        undefined,
        undefined,
        request
      );
      return response;
    }

    const senateService = createSenateTradingService(env, logger);
    const follows = await senateService.getUserFollows(user.id);

    return json({ follows }, 200, request);
  } catch (error) {
    logger.error("Error getting user follows", error);
    return json({ error: "Failed to fetch user follows" }, 500, request);
  }
}

/**
 * POST /v1/api/senate-trading/follows
 * Follow a senator (requires authentication)
 */
export async function followSenator(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  const auth = await authenticateRequest(
    request,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Authentication required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  try {
    const payload = await request.json();
    const { senatorName, alertOnPurchase, alertOnSale } = payload;

    // Validate senatorName
    if (!senatorName || typeof senatorName !== "string") {
      return json({ error: "senatorName is required and must be a string" }, 400, request);
    }
    
    // Validate senatorName length and format
    const trimmedSenatorName = senatorName.trim();
    if (trimmedSenatorName.length === 0) {
      return json({ error: "senatorName cannot be empty" }, 400, request);
    }
    if (trimmedSenatorName.length > 200) {
      return json({ error: "senatorName must be 200 characters or less" }, 400, request);
    }
    
    // Validate alert preferences
    if (alertOnPurchase !== undefined && typeof alertOnPurchase !== "boolean") {
      return json({ error: "alertOnPurchase must be a boolean" }, 400, request);
    }
    if (alertOnSale !== undefined && typeof alertOnSale !== "boolean") {
      return json({ error: "alertOnSale must be a boolean" }, 400, request);
    }

    // Get user_id from username
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(auth.username)
      .first<{ id: string }>();

    if (!user) {
      const { response } = createErrorResponse(
        "USER_NOT_FOUND",
        "User not found",
        undefined,
        undefined,
        request
      );
      return response;
    }

    const preferences: SenatorFollowPreferences = {
      alertOnPurchase: alertOnPurchase !== false, // Default to true
      alertOnSale: alertOnSale !== false, // Default to true
    };

    const senateService = createSenateTradingService(env, logger);
    await senateService.followSenator(
      user.id,
      auth.username,
      trimmedSenatorName,
      preferences
    );

    return json({ success: true, senatorName: trimmedSenatorName }, 200, request);
  } catch (error) {
    logger.error("Error following senator", error);
    return json({ error: "Failed to follow senator" }, 500, request);
  }
}

/**
 * DELETE /v1/api/senate-trading/follows/:senatorName
 * Unfollow a senator (requires authentication)
 */
export async function unfollowSenator(
  request: Request,
  env: Env,
  logger: Logger,
  senatorName: string
): Promise<Response> {
  const auth = await authenticateRequest(
    request,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Authentication required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  try {
    // Get user_id from username
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(auth.username)
      .first<{ id: string }>();

    if (!user) {
      const { response } = createErrorResponse(
        "USER_NOT_FOUND",
        "User not found",
        undefined,
        undefined,
        request
      );
      return response;
    }

    const senateService = createSenateTradingService(env, logger);
    await senateService.unfollowSenator(user.id, senatorName);

    return json({ success: true, senatorName }, 200, request);
  } catch (error) {
    logger.error("Error unfollowing senator", error);
    return json({ error: "Failed to unfollow senator" }, 500, request);
  }
}

/**
 * PUT /v1/api/senate-trading/follows/:senatorName
 * Update follow preferences for a senator (requires authentication)
 */
export async function updateFollowPreferences(
  request: Request,
  env: Env,
  logger: Logger,
  senatorName: string
): Promise<Response> {
  const auth = await authenticateRequest(
    request,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Authentication required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  try {
    // Validate senatorName from URL
    if (!senatorName || senatorName.trim().length === 0) {
      return json({ error: "Invalid senator name" }, 400, request);
    }
    if (senatorName.length > 200) {
      return json({ error: "Senator name too long" }, 400, request);
    }
    
    const payload = await request.json();
    const { alertOnPurchase, alertOnSale } = payload;

    // Validate alert preferences
    if (alertOnPurchase !== undefined && typeof alertOnPurchase !== "boolean") {
      return json({ error: "alertOnPurchase must be a boolean" }, 400, request);
    }
    if (alertOnSale !== undefined && typeof alertOnSale !== "boolean") {
      return json({ error: "alertOnSale must be a boolean" }, 400, request);
    }

    // Get user_id from username
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(auth.username)
      .first<{ id: string }>();

    if (!user) {
      const { response } = createErrorResponse(
        "USER_NOT_FOUND",
        "User not found",
        undefined,
        undefined,
        request
      );
      return response;
    }

    const preferences: Partial<SenatorFollowPreferences> = {};
    if (typeof alertOnPurchase === "boolean") {
      preferences.alertOnPurchase = alertOnPurchase;
    }
    if (typeof alertOnSale === "boolean") {
      preferences.alertOnSale = alertOnSale;
    }

    const senateService = createSenateTradingService(env, logger);
    await senateService.updateFollowPreferences(user.id, senatorName, preferences);

    return json({ success: true, senatorName }, 200, request);
  } catch (error) {
    logger.error("Error updating follow preferences", error);
    return json({ error: "Failed to update follow preferences" }, 500, request);
  }
}

/**
 * GET /v1/api/senate-trading/alerts
 * Get user's senator alerts (requires authentication)
 * Returns recent trades that match user's holdings or followed senators
 */
export async function getUserSenatorAlerts(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  const auth = await authenticateRequest(
    request,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Authentication required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  try {
    // Get user_id from username
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(auth.username)
      .first<{ id: string }>();

    if (!user) {
      const { response } = createErrorResponse(
        "USER_NOT_FOUND",
        "User not found",
        undefined,
        undefined,
        request
      );
      return response;
    }

    // Get user's favorite stocks
    const favoriteStocks = await env.stockly
      .prepare("SELECT symbol FROM user_favorite_stocks WHERE username = ?")
      .bind(auth.username)
      .all<{ symbol: string }>();

    const stockSymbols = (favoriteStocks.results || []).map((r) => r.symbol.toUpperCase());

    // Get user's followed senators
    const senateService = createSenateTradingService(env, logger);
    const follows = await senateService.getUserFollows(user.id);
    const followedSenators = follows.map((f) => f.senatorName);

    // Get recent trades (last 7 days)
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 7);
    const sinceDateStr = sinceDate.toISOString().split("T")[0];

    const recentTrades = await senateService.getTradesSince(sinceDateStr, 500);

    // Filter trades that match user's holdings or followed senators
    const matchingTrades = recentTrades.filter((trade) => {
      const hasStock = stockSymbols.includes(trade.symbol.toUpperCase());
      const isFollowing = followedSenators.some(
        (s) => s.toLowerCase() === trade.senatorName.toLowerCase()
      );
      return hasStock || isFollowing;
    });

    return json({ trades: matchingTrades, count: matchingTrades.length }, 200, request);
  } catch (error) {
    logger.error("Error getting user senator alerts", error);
    return json({ error: "Failed to fetch senator alerts" }, 500, request);
  }
}

