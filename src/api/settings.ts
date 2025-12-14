import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";

export interface UserSettings {
  userId: string;
  refreshIntervalMinutes: number;
  cacheStaleTimeMinutes?: number;
  cacheGcTimeMinutes?: number;
  newsFavoriteSymbols?: string[];
  updatedAt: string;
}

/**
 * GET /v1/api/settings
 * Retrieve user settings (userId from JWT)
 */
export async function getSettings(
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
    const row = await env.stockly
      .prepare(
        `SELECT user_id, username, refresh_interval_minutes, cache_stale_time_minutes, cache_gc_time_minutes, news_favorite_symbols, updated_at
         FROM user_settings WHERE username = ?`
      )
      .bind(username)
      .first<{
        user_id: string;
        username: string | null;
        refresh_interval_minutes: number;
        cache_stale_time_minutes: number | null;
        cache_gc_time_minutes: number | null;
        news_favorite_symbols: string | null;
        updated_at: string;
      }>();

    if (row) {
      let newsFavoriteSymbols: string[] | undefined;
      if (row.news_favorite_symbols) {
        try {
          newsFavoriteSymbols = JSON.parse(row.news_favorite_symbols);
        } catch (e) {
          logger.warn("Failed to parse news_favorite_symbols", { username, userId: row.user_id, error: e });
        }
      }

      const settings: UserSettings = {
        userId: row.user_id,
        refreshIntervalMinutes: row.refresh_interval_minutes,
        cacheStaleTimeMinutes: row.cache_stale_time_minutes ?? 5,
        cacheGcTimeMinutes: row.cache_gc_time_minutes ?? 10,
        newsFavoriteSymbols,
        updatedAt: row.updated_at,
      };
      return json(settings, 200, request);
    } else {
      // Get user_id from username for default settings
      const user = await env.stockly
        .prepare("SELECT id FROM users WHERE username = ?")
        .bind(username)
        .first<{ id: string }>();
      
      // Return default settings if not found
      const defaultSettings: UserSettings = {
        userId: user?.id || "",
        refreshIntervalMinutes: 5,
        cacheStaleTimeMinutes: 5,
        cacheGcTimeMinutes: 10,
        newsFavoriteSymbols: [],
        updatedAt: new Date().toISOString(),
      };
      return json(defaultSettings, 200, request);
    }
  } catch (error) {
    logger.error("Failed to retrieve settings", error, { username });
    return json({ error: "Failed to retrieve settings" }, 500, request);
  }
}

/**
 * PUT /v1/api/settings
 * Update user settings
 */
export async function updateSettings(
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
    // Get user_id from username first
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
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

    const userId = user.id;

    const payload = await request.json();
    const { refreshIntervalMinutes, cacheStaleTimeMinutes, cacheGcTimeMinutes } = payload;
    // userId is from JWT authentication, not from payload

    // Validate refreshIntervalMinutes
    if (refreshIntervalMinutes === null || refreshIntervalMinutes === undefined) {
      return json({ error: "refreshIntervalMinutes is required" }, 400, request);
    }

    const minutes = Number(refreshIntervalMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) {
      return json(
        {
          error:
            "refreshIntervalMinutes must be a number between 1 and 720 (minutes)",
        },
        400,
        request
      );
    }

    const roundedMinutes = Math.round(minutes);

    // Validate cache settings (optional)
    let staleTimeMinutes: number | null = null;
    if (cacheStaleTimeMinutes !== null && cacheStaleTimeMinutes !== undefined) {
      const staleTime = Number(cacheStaleTimeMinutes);
      if (!Number.isFinite(staleTime) || staleTime < 0 || staleTime > 60) {
        return json(
          { error: "cacheStaleTimeMinutes must be between 0 and 60 (minutes)" },
          400,
          request
        );
      }
      staleTimeMinutes = Math.round(staleTime);
    }

    let gcTimeMinutes: number | null = null;
    if (cacheGcTimeMinutes !== null && cacheGcTimeMinutes !== undefined) {
      const gcTime = Number(cacheGcTimeMinutes);
      if (!Number.isFinite(gcTime) || gcTime < 1 || gcTime > 120) {
        return json(
          { error: "cacheGcTimeMinutes must be between 1 and 120 (minutes)" },
          400,
          request
        );
      }
      gcTimeMinutes = Math.round(gcTime);
    }

    const now = new Date().toISOString();

    // Check if settings already exist for user (by username)
    const existing = await env.stockly
      .prepare(`SELECT user_id FROM user_settings WHERE username = ?`)
      .bind(username)
      .first();

    if (existing) {
      // Update existing settings
      await env.stockly
        .prepare(
          `UPDATE user_settings
           SET refresh_interval_minutes = ?,
               cache_stale_time_minutes = ?,
               cache_gc_time_minutes = ?,
               updated_at = ?
           WHERE username = ?`
        )
        .bind(roundedMinutes, staleTimeMinutes, gcTimeMinutes, now, username)
        .run();
      return json({
        success: true,
        message: "Settings updated",
        settings: {
          userId,
          refreshIntervalMinutes: roundedMinutes,
          cacheStaleTimeMinutes: staleTimeMinutes ?? 5,
          cacheGcTimeMinutes: gcTimeMinutes ?? 10,
          updatedAt: now,
        },
      }, 200, request);
    } else {
      // Insert new settings (with both user_id and username)
      await env.stockly
        .prepare(
          `INSERT INTO user_settings (user_id, username, refresh_interval_minutes, cache_stale_time_minutes, cache_gc_time_minutes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(userId, username, roundedMinutes, staleTimeMinutes, gcTimeMinutes, now)
        .run();
      return json(
        {
          success: true,
          message: "Settings created",
          settings: {
            userId,
            refreshIntervalMinutes: roundedMinutes,
            cacheStaleTimeMinutes: staleTimeMinutes ?? 5,
            cacheGcTimeMinutes: gcTimeMinutes ?? 10,
            updatedAt: now,
          },
        },
        201,
        request
      );
    }
  } catch (error) {
    logger.error("Failed to update settings", error, { username });
    return json({ error: "Failed to update settings" }, 500, request);
  }
}

