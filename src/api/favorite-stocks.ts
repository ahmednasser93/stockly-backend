import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest, authenticateRequestWithAdmin } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";

export interface FavoriteStock {
  symbol: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteStocksResponse {
  stocks: FavoriteStock[];
}

/**
 * GET /v1/api/favorite-stocks
 * Retrieve user's favorite stocks (userId from JWT)
 */
export async function getFavoriteStocks(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  // Authenticate request to get userId
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

  const username = auth.username;

  try {
    const rows = await env.stockly
      .prepare(
        `SELECT symbol, display_order, created_at, updated_at
         FROM user_favorite_stocks
         WHERE username = ?
         ORDER BY display_order ASC, created_at ASC`
      )
      .bind(username)
      .all<{
        symbol: string;
        display_order: number;
        created_at: number;
        updated_at: number;
      }>();

    const stocks: FavoriteStock[] = (rows.results || []).map((row) => ({
      symbol: row.symbol,
      displayOrder: row.display_order,
      createdAt: new Date(row.created_at * 1000).toISOString(),
      updatedAt: new Date(row.updated_at * 1000).toISOString(),
    }));

    logger.info("Fetched favorite stocks", { username, count: stocks.length });
    return json({ stocks }, 200, request);
  } catch (error) {
    logger.error("Failed to retrieve favorite stocks", error, { username });
    return json({ error: "Failed to retrieve favorite stocks" }, 500, request);
  }
}

/**
 * POST /v1/api/favorite-stocks
 * Add or update favorite stocks (userId from JWT)
 * Body: { symbols: string[] }
 */
export async function updateFavoriteStocks(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  // Authenticate request to get userId
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

  const username = auth.username;

  try {
    // Get user_id from username (required for foreign key constraint)
    const user = await env.stockly
      .prepare(`SELECT id FROM users WHERE username = ?`)
      .bind(username)
      .first<{ id: string }>();

    if (!user) {
      logger.warn("User not found in database", { username });
      return json({ error: "User account not found. Please sign in again." }, 404, request);
    }

    const userId = user.id;

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.error("Failed to parse request body", parseError, { userId });
      return json({ error: "Invalid JSON in request body" }, 400, request);
    }

    // Log the received body for debugging
    logger.debug("Received favorite stocks update request", { 
      userId, 
      bodyType: typeof body,
      bodyStringified: JSON.stringify(body),
      hasSymbols: body && typeof body === "object" && "symbols" in body,
      bodyKeys: body && typeof body === "object" ? Object.keys(body as object) : [],
    });

    if (!body || typeof body !== "object") {
      logger.warn("Invalid request body type", { userId, bodyType: typeof body, bodyStringified: JSON.stringify(body) });
      return json({ error: "Invalid request body. Expected an object with 'symbols' array." }, 400, request);
    }

    if (!("symbols" in body)) {
      logger.warn("Missing 'symbols' property in request body", { 
        userId, 
        bodyKeys: Object.keys(body as object),
        bodyStringified: JSON.stringify(body),
      });
      return json({ error: "Invalid request body. Missing 'symbols' property. Expected { symbols: string[] }" }, 400, request);
    }

    const bodyWithSymbols = body as { symbols: unknown };
    if (!Array.isArray(bodyWithSymbols.symbols)) {
      logger.warn("'symbols' is not an array", { 
        userId, 
        symbolsType: typeof bodyWithSymbols.symbols,
        symbolsValue: bodyWithSymbols.symbols,
        bodyStringified: JSON.stringify(body),
      });
      return json({ error: "Invalid request body. 'symbols' must be an array." }, 400, request);
    }

    const symbolsArray = bodyWithSymbols.symbols as unknown[];
    
    // Log the raw symbols array
    logger.debug("Processing symbols array", {
      userId,
      symbolsArrayLength: symbolsArray.length,
      symbolsArray: JSON.stringify(symbolsArray),
      symbolsArrayTypes: symbolsArray.map(s => typeof s),
    });
    
    const symbols: string[] = symbolsArray
      .map((s: unknown) => {
        if (typeof s !== "string") {
          logger.debug("Skipping non-string symbol", { userId, symbol: s, symbolType: typeof s });
          return null;
        }
        const normalized = s.trim().toUpperCase();
        if (normalized.length === 0) {
          logger.debug("Skipping empty symbol", { userId, originalSymbol: s });
          return null;
        }
        return normalized;
      })
      .filter((s: string | null): s is string => s !== null && s.length > 0);

    // Remove duplicates (already normalized, so just use Set)
    const uniqueSymbols = Array.from(new Set(symbols));
    
    logger.debug("Normalized symbols", {
      userId,
      originalCount: symbolsArray.length,
      normalizedCount: symbols.length,
      uniqueCount: uniqueSymbols.length,
      uniqueSymbols: uniqueSymbols,
    });

    const now = Math.floor(Date.now() / 1000);

    // Delete all existing stocks for this user first (by username)
    await env.stockly
      .prepare(`DELETE FROM user_favorite_stocks WHERE username = ?`)
      .bind(username)
      .run();

    // Insert new stocks with display order using INSERT OR REPLACE to handle any race conditions
    if (uniqueSymbols.length > 0) {
      for (let i = 0; i < uniqueSymbols.length; i++) {
        try {
          // Use INSERT OR REPLACE to handle any potential duplicates from race conditions
          // This ensures that even if two requests come in simultaneously, we won't get UNIQUE constraint errors
          await env.stockly
            .prepare(
              `INSERT OR REPLACE INTO user_favorite_stocks (user_id, username, symbol, display_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(userId, username, uniqueSymbols[i], i, now, now)
            .run();
        } catch (insertError) {
          // Log the specific insert error for debugging
          logger.error("Failed to insert favorite stock", insertError, {
            userId,
            symbol: uniqueSymbols[i],
            index: i,
            totalSymbols: uniqueSymbols.length,
          });
          // Re-throw to be caught by outer catch
          throw insertError;
        }
      }
    }

    logger.info("Updated favorite stocks", { username, userId, count: uniqueSymbols.length, symbols: uniqueSymbols });

    return json({
      success: true,
      message: uniqueSymbols.length > 0 ? "Favorite stocks updated" : "All favorite stocks cleared",
      stocks: uniqueSymbols.map((symbol, index) => ({
        symbol,
        displayOrder: index,
        createdAt: new Date(now * 1000).toISOString(),
        updatedAt: new Date(now * 1000).toISOString(),
      })),
    }, 200, request);
  } catch (error) {
    // Serialize error properly for logging
    const errorDetails = error instanceof Error 
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : { error: String(error) };
    
    logger.error("Failed to update favorite stocks", error, { 
      username,
      ...errorDetails,
    });
    
    // Provide more specific error messages
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      
      // Foreign key constraint violation - user doesn't exist
      if (errorMsg.includes("foreign key") || errorMsg.includes("foreign_key")) {
        logger.error("Foreign key constraint violation - user not found", { username, error: error.message });
        return json({ error: "User account not found. Please sign in again." }, 404, request);
      }
      
      // Unique constraint violation
      if (errorMsg.includes("unique constraint") || errorMsg.includes("unique") || errorMsg.includes("duplicate")) {
        return json({ error: "Duplicate symbol detected" }, 400, request);
      }
      
      // General database errors
      if (errorMsg.includes("sqlite_error") || errorMsg.includes("database")) {
        logger.error("Database error in updateFavoriteStocks", { username, error: error.message, stack: error.stack });
        return json({ error: "Database error occurred. Please try again." }, 500, request);
      }
      
      // Constraint violations
      if (errorMsg.includes("constraint")) {
        logger.error("Constraint violation in updateFavoriteStocks", { username, error: error.message });
        return json({ error: "Data validation failed. Please check your input." }, 400, request);
      }
    }
    
    const errorMessage = error instanceof Error ? error.message : "Failed to update favorite stocks";
    logger.error("Unexpected error in updateFavoriteStocks", { 
      username, 
      error: errorMessage,
      errorObject: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
    });
    return json({ error: "An unexpected error occurred. Please try again." }, 500, request);
  }
}

/**
 * DELETE /v1/api/favorite-stocks/:symbol
 * Remove a specific favorite stock (userId from JWT)
 */
export async function deleteFavoriteStock(
  request: Request,
  symbol: string,
  env: Env,
  logger: Logger
): Promise<Response> {
  // Authenticate request to get userId
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

  const username = auth.username;
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!normalizedSymbol) {
    return json({ error: "Invalid symbol" }, 400, request);
  }

  try {
    const result = await env.stockly
      .prepare(`DELETE FROM user_favorite_stocks WHERE username = ? AND symbol = ?`)
      .bind(username, normalizedSymbol)
      .run();

    const meta = (result as any)?.meta ?? {};
    const deleted = meta.changes > 0;

    if (deleted) {
      logger.info("Deleted favorite stock", { username, symbol: normalizedSymbol });
      return json({ success: true, message: "Favorite stock removed" }, 200, request);
    } else {
      return json({ error: "Favorite stock not found" }, 404, request);
    }
  } catch (error) {
    logger.error("Failed to delete favorite stock", error, { username, symbol: normalizedSymbol });
    return json({ error: "Failed to delete favorite stock" }, 500, request);
  }
}

export interface StockWithNews {
  symbol: string;
  hasNews: boolean;
}

export interface UserFavoriteStocks {
  userId: string;
  username: string | null;
  stocks: string[];
  stocksWithNews: StockWithNews[];
  count: number;
}

export interface AllUsersFavoriteStocksResponse {
  users: UserFavoriteStocks[];
}

/**
 * GET /v1/api/favorite-stocks/all
 * Get all users' favorite stocks (admin only)
 */
export async function getAllUsersFavoriteStocks(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  // Authenticate request to get userId and admin status
  const auth = await authenticateRequestWithAdmin(
    request,
    env,
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

  if (!auth.isAdmin) {
    return json({ error: "Admin access required" }, 403, request);
  }

  try {
    // Get all users who have either favorite stocks OR devices
    // First, get all users with favorite stocks
    const favoriteStocksRows = await env.stockly
      .prepare(
        `SELECT 
           ufs.user_id,
           u.username,
           ufs.symbol
         FROM user_favorite_stocks ufs
         LEFT JOIN users u ON ufs.user_id = u.id
         WHERE u.username IS NOT NULL
         ORDER BY u.username ASC, ufs.display_order ASC, ufs.created_at ASC`
      )
      .all<{
        user_id: string;
        username: string | null;
        symbol: string;
      }>();

    // Get all users with devices (even if they don't have favorite stocks)
    const usersWithDevices = await env.stockly
      .prepare(
        `SELECT DISTINCT
           u.id as user_id,
           u.username
         FROM users u
         INNER JOIN devices d ON u.id = d.user_id AND d.is_active = 1
         WHERE u.username IS NOT NULL`
      )
      .all<{
        user_id: string;
        username: string | null;
      }>();

    // Get all users with alerts (even if they don't have favorite stocks or devices)
    const usersWithAlerts = await env.stockly
      .prepare(
        `SELECT DISTINCT
           u.id as user_id,
           u.username
         FROM users u
         INNER JOIN alerts a ON a.username = u.username
         WHERE u.username IS NOT NULL`
      )
      .all<{
        user_id: string;
        username: string | null;
      }>();

    // Combine both sets - use favorite stocks rows as primary, but ensure all users with devices are included
    const allUserIds = new Set<string>();
    const rows: Array<{ user_id: string; username: string | null; symbol: string | null }> = [];

    // Add all favorite stocks rows
    for (const row of favoriteStocksRows.results || []) {
      allUserIds.add(row.user_id);
      rows.push({
        user_id: row.user_id,
        username: row.username,
        symbol: row.symbol,
      });
    }

    // Add users with devices who don't have favorite stocks (with null symbol)
    for (const user of usersWithDevices.results || []) {
      if (!allUserIds.has(user.user_id)) {
        allUserIds.add(user.user_id);
        rows.push({
          user_id: user.user_id,
          username: user.username,
          symbol: null, // No favorite stocks for this user
        });
      }
    }

    // Add users with alerts who don't have favorite stocks or devices (with null symbol)
    for (const user of usersWithAlerts.results || []) {
      if (!allUserIds.has(user.user_id)) {
        allUserIds.add(user.user_id);
        rows.push({
          user_id: user.user_id,
          username: user.username,
          symbol: null, // No favorite stocks for this user
        });
      }
    }

    // Get all unique symbols from favorite stocks (filter out null symbols)
    const allSymbols = new Set<string>();
    for (const row of rows) {
      if (row.symbol) {
        allSymbols.add(row.symbol);
      }
    }

    // Check which symbols have news (from user_saved_news table)
    // This shows which stocks have news that users have interacted with
    const symbolsWithNews = new Set<string>();
    if (allSymbols.size > 0) {
      const symbolsArray = Array.from(allSymbols);
      // Query in batches to avoid SQL parameter limits
      for (let i = 0; i < symbolsArray.length; i += 50) {
        const batch = symbolsArray.slice(i, i + 50);
        const placeholders = batch.map(() => "?").join(",");
        const newsRows = await env.stockly
          .prepare(
            `SELECT DISTINCT symbol 
             FROM user_saved_news 
             WHERE symbol IN (${placeholders}) AND symbol IS NOT NULL`
          )
          .bind(...batch)
          .all<{ symbol: string }>();
        
        for (const newsRow of newsRows.results || []) {
          if (newsRow.symbol) {
            symbolsWithNews.add(newsRow.symbol.toUpperCase());
          }
        }
      }
    }

    // Group by user_id
    const userStocksMap = new Map<string, { username: string | null; stocks: string[] }>();
    
    for (const row of rows) {
      if (!userStocksMap.has(row.user_id)) {
        userStocksMap.set(row.user_id, {
          username: row.username,
          stocks: [],
        });
      }
      // Only add non-null symbols
      if (row.symbol) {
        userStocksMap.get(row.user_id)!.stocks.push(row.symbol);
      }
    }

    // Convert to array format with news information
    const users: UserFavoriteStocks[] = Array.from(userStocksMap.entries()).map(([userId, data]) => {
      const stocksWithNews: StockWithNews[] = data.stocks.map(symbol => ({
        symbol,
        hasNews: symbolsWithNews.has(symbol.toUpperCase()),
      }));

      return {
        userId,
        username: data.username || userId,
        stocks: data.stocks,
        stocksWithNews,
        count: data.stocks.length,
      };
    });

    // Sort by username
    users.sort((a, b) => {
      const aName = a.username || a.userId;
      const bName = b.username || b.userId;
      return aName.localeCompare(bName);
    });

    logger.info("Fetched all users' favorite stocks with news info", { 
      count: users.length,
      symbolsWithNews: symbolsWithNews.size 
    });
    return json({ users }, 200, request);
  } catch (error) {
    logger.error("Failed to retrieve all users' favorite stocks", error);
    return json({ error: "Failed to retrieve all users' favorite stocks" }, 500, request);
  }
}

