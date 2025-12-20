import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequestWithAdmin } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";
import { listAlerts } from "../alerts/storage";
import type { Device } from "./devices";
import type { FavoriteStock } from "./favorite-stocks";

export interface UserWithActivity {
  userId: string;
  username: string | null;
  hasFavoriteStocks: boolean;
  favoriteStocksCount: number;
  favoriteStocks: string[]; // Actual stock symbols
  hasDevices: boolean;
  devicesCount: number;
  hasAlerts: boolean;
  alertsCount: number;
  activeAlertsCount: number;
}

export interface AllUsersResponse {
  users: UserWithActivity[];
}

/**
 * GET /v1/api/users/all
 * Get all users with their activity status (admin only)
 * Returns all users, even if they have no favorite stocks, devices, or alerts
 */
export async function getAllUsers(
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
    // Get ALL users from the database
    const allUsers = await env.stockly
      .prepare(
        `SELECT 
           u.id as user_id,
           u.username
         FROM users u
         WHERE u.username IS NOT NULL
         ORDER BY u.username ASC`
      )
      .all<{
        user_id: string;
        username: string | null;
      }>();

    // Get favorite stocks per user (with actual symbols)
    const favoriteStocksRows = await env.stockly
      .prepare(
        `SELECT 
           ufs.user_id,
           ufs.symbol
         FROM user_favorite_stocks ufs
         ORDER BY ufs.user_id, ufs.display_order ASC, ufs.created_at ASC`
      )
      .all<{
        user_id: string;
        symbol: string;
      }>();
    
    // Group favorite stocks by user_id
    const favoriteStocksByUser = new Map<string, string[]>();
    for (const row of favoriteStocksRows.results || []) {
      if (!favoriteStocksByUser.has(row.user_id)) {
        favoriteStocksByUser.set(row.user_id, []);
      }
      favoriteStocksByUser.get(row.user_id)!.push(row.symbol);
    }

    // Get devices counts per user
    const devicesCounts = await env.stockly
      .prepare(
        `SELECT 
           u.id as user_id,
           COUNT(*) as count
         FROM users u
         INNER JOIN user_push_tokens upt ON u.id = upt.user_id
         GROUP BY u.id`
      )
      .all<{
        user_id: string;
        count: number;
      }>();

    // Get alerts counts per user
    const alertsCounts = await env.stockly
      .prepare(
        `SELECT 
           a.username,
           COUNT(*) as total_count,
           SUM(CASE WHEN a.status = 'active' THEN 1 ELSE 0 END) as active_count
         FROM alerts a
         WHERE a.username IS NOT NULL
         GROUP BY a.username`
      )
      .all<{
        username: string;
        total_count: number;
        active_count: number;
      }>();

    // Create maps for quick lookup

    const devicesMap = new Map<string, number>();
    for (const row of devicesCounts.results || []) {
      devicesMap.set(row.user_id, row.count);
    }

    const alertsMap = new Map<string, { total: number; active: number }>();
    for (const row of alertsCounts.results || []) {
      alertsMap.set(row.username, {
        total: row.total_count,
        active: row.active_count,
      });
    }

    // Build response with all users
    const users: UserWithActivity[] = (allUsers.results || []).map((user) => {
      const favoriteStocks = favoriteStocksByUser.get(user.user_id) || [];
      const favoriteStocksCount = favoriteStocks.length;
      const devicesCount = devicesMap.get(user.user_id) || 0;
      const alertsData = alertsMap.get(user.username || "") || { total: 0, active: 0 };

      return {
        userId: user.user_id,
        username: user.username,
        hasFavoriteStocks: favoriteStocksCount > 0,
        favoriteStocksCount,
        favoriteStocks, // Include actual stock symbols
        hasDevices: devicesCount > 0,
        devicesCount,
        hasAlerts: alertsData.total > 0,
        alertsCount: alertsData.total,
        activeAlertsCount: alertsData.active,
      };
    });

    logger.info("Fetched all users with activity status", {
      count: users.length,
      usersWithStocks: users.filter(u => u.hasFavoriteStocks).length,
      usersWithDevices: users.filter(u => u.hasDevices).length,
      usersWithAlerts: users.filter(u => u.hasAlerts).length,
    });

    return json({ users }, 200, request);
  } catch (error) {
    logger.error("Failed to retrieve all users", error);
    return json({ error: "Failed to retrieve all users" }, 500, request);
  }
}

export interface UserDetails {
  userId: string;
  username: string | null;
  email: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * GET /v1/api/users/:username
 * Get user details by username (admin only)
 */
export async function getUserByUsername(
  request: Request,
  username: string,
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
    const user = await env.stockly
      .prepare(
        `SELECT 
           u.id as user_id,
           u.username,
           u.email,
           u.created_at,
           u.updated_at
         FROM users u
         WHERE u.username = ?`
      )
      .bind(username)
      .first<{
        user_id: string;
        username: string | null;
        email: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();

    if (!user) {
      return json({ error: "User not found" }, 404, request);
    }

    const userDetails: UserDetails = {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };

    logger.info("Fetched user details", { username });
    return json(userDetails, 200, request);
  } catch (error) {
    logger.error("Failed to retrieve user details", error, { username });
    return json({ error: "Failed to retrieve user details" }, 500, request);
  }
}

/**
 * GET /v1/api/users/:username/devices
 * Get all devices for a specific user (admin only)
 */
export async function getUserDevices(
  request: Request,
  username: string,
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
    // Get user_id from username
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();

    if (!user) {
      return json({ error: "User not found" }, 404, request);
    }

    // Get all devices for this user
    // Use JOIN with users table since upt.username might be null
    let rows: { results?: Array<any> } | null = null;
    try {
      rows = await env.stockly
        .prepare(
          `SELECT 
             upt.user_id, 
             upt.push_token, 
             upt.device_info,
             upt.device_type,
             upt.created_at, 
             upt.updated_at,
             COALESCE(upt.username, u.username) as username
           FROM user_push_tokens upt
           LEFT JOIN users u ON upt.user_id = u.id
           WHERE u.username = ?
           ORDER BY upt.updated_at DESC`
        )
        .bind(username)
        .all<{
          user_id: string | null;
          push_token: string;
          device_info: string | null;
          device_type: string | null;
          created_at: string;
          updated_at: string;
          username: string | null;
        }>();
    } catch (error) {
      // If device_type column doesn't exist, select without it
      if (error instanceof Error && error.message.includes('device_type')) {
        try {
          rows = await env.stockly
            .prepare(
              `SELECT 
                 upt.user_id, 
                 upt.push_token, 
                 upt.device_info, 
                 upt.created_at, 
                 upt.updated_at,
                 COALESCE(upt.username, u.username) as username
               FROM user_push_tokens upt
               LEFT JOIN users u ON upt.user_id = u.id
               WHERE u.username = ?
               ORDER BY upt.updated_at DESC`
            )
            .bind(username)
            .all<{
              user_id: string | null;
              push_token: string;
              device_info: string | null;
              created_at: string;
              updated_at: string;
              username: string | null;
            }>();
        } catch (fallbackError) {
          // If even device_info doesn't exist, use minimal query
          if (fallbackError instanceof Error && fallbackError.message.includes('device_info')) {
            rows = await env.stockly
              .prepare(
                `SELECT 
                   upt.user_id, 
                   upt.push_token, 
                   upt.created_at, 
                   upt.updated_at,
                   COALESCE(upt.username, u.username) as username
                 FROM user_push_tokens upt
                 LEFT JOIN users u ON upt.user_id = u.id
                 WHERE u.username = ?
                 ORDER BY upt.updated_at DESC`
              )
              .bind(username)
              .all<{
                user_id: string;
                push_token: string;
                created_at: string;
                updated_at: string;
                username: string | null;
              }>();
          } else {
            throw fallbackError;
          }
        }
      } else {
        throw error;
      }
    }

    if (!rows || !rows.results) {
      return json({ devices: [] }, 200, request);
    }

    // For each device, count alerts
    const devices: Device[] = await Promise.all(
      rows.results.map(async (row) => {
        // Count alerts for this user
        const totalAlertsResult = await env.stockly
          .prepare(`SELECT COUNT(*) as count FROM alerts WHERE username = ?`)
          .bind(username)
          .first<{ count: number }>();

        const activeAlertsResult = await env.stockly
          .prepare(`SELECT COUNT(*) as count FROM alerts WHERE username = ? AND status = 'active'`)
          .bind(username)
          .first<{ count: number }>();

        return {
          userId: row.user_id,
          username: row.username,
          pushToken: row.push_token,
          deviceInfo: row.device_info,
          deviceType: 'device_type' in row ? (row as any).device_type : null,
          alertCount: totalAlertsResult?.count || 0,
          activeAlertCount: activeAlertsResult?.count || 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
    );

    logger.info("Fetched user devices", { username, count: devices.length });
    return json({ devices }, 200, request);
  } catch (error) {
    logger.error("Failed to retrieve user devices", error, { username });
    return json({ error: "Failed to retrieve user devices" }, 500, request);
  }
}

/**
 * GET /v1/api/users/:username/alerts
 * Get all alerts for a specific user (admin only)
 */
export async function getUserAlerts(
  request: Request,
  username: string,
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
    // Verify user exists
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();

    if (!user) {
      return json({ error: "User not found" }, 404, request);
    }

    // Get all alerts for this user
    const alerts = await listAlerts(env, username);

    logger.info("Fetched user alerts", { username, count: alerts.length });
    return json({ alerts }, 200, request);
  } catch (error) {
    logger.error("Failed to retrieve user alerts", error, { username });
    return json({ error: "Failed to retrieve user alerts" }, 500, request);
  }
}

/**
 * GET /v1/api/users/:username/favorite-stocks
 * Get favorite stocks for a specific user (admin only)
 */
export async function getUserFavoriteStocks(
  request: Request,
  username: string,
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
    // Verify user exists and get user_id
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();

    if (!user) {
      return json({ error: "User not found" }, 404, request);
    }

    // Get favorite stocks for this user
    const rows = await env.stockly
      .prepare(
        `SELECT symbol, display_order, created_at, updated_at
         FROM user_favorite_stocks
         WHERE user_id = ?
         ORDER BY display_order ASC, created_at ASC`
      )
      .bind(user.id)
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

    logger.info("Fetched user favorite stocks", { username, count: stocks.length });
    return json({ stocks }, 200, request);
  } catch (error) {
    logger.error("Failed to retrieve user favorite stocks", error, { username });
    return json({ error: "Failed to retrieve user favorite stocks" }, 500, request);
  }
}

