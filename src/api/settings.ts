import { json } from "../util";
import type { Env } from "../index";

export interface UserSettings {
  userId: string;
  refreshIntervalMinutes: number;
  cacheStaleTimeMinutes?: number;
  cacheGcTimeMinutes?: number;
  updatedAt: string;
}

/**
 * GET /v1/api/settings/:userId
 * Retrieve user settings
 */
import type { Logger } from "../logging/logger";

export async function getSettings(
  userId: string,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (!userId) {
    return json({ error: "userId is required" }, 400);
  }

  try {
    const row = await env.stockly
      .prepare(
        `SELECT user_id, refresh_interval_minutes, cache_stale_time_minutes, cache_gc_time_minutes, updated_at
         FROM user_settings WHERE user_id = ?`
      )
      .bind(userId)
      .first<{
        user_id: string;
        refresh_interval_minutes: number;
        cache_stale_time_minutes: number | null;
        cache_gc_time_minutes: number | null;
        updated_at: string;
      }>();

    if (row) {
      const settings: UserSettings = {
        userId: row.user_id,
        refreshIntervalMinutes: row.refresh_interval_minutes,
        cacheStaleTimeMinutes: row.cache_stale_time_minutes ?? 5,
        cacheGcTimeMinutes: row.cache_gc_time_minutes ?? 10,
        updatedAt: row.updated_at,
      };
      return json(settings);
    } else {
      // Return default settings if not found
      const defaultSettings: UserSettings = {
        userId,
        refreshIntervalMinutes: 5,
        cacheStaleTimeMinutes: 5,
        cacheGcTimeMinutes: 10,
        updatedAt: new Date().toISOString(),
      };
      return json(defaultSettings);
    }
  } catch (error) {
    console.error("Failed to retrieve settings:", error);
    return json({ error: "Failed to retrieve settings" }, 500);
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
  try {
    const payload = await request.json();
    const { userId, refreshIntervalMinutes, cacheStaleTimeMinutes, cacheGcTimeMinutes } = payload;

    if (!userId || typeof userId !== "string") {
      return json({ error: "userId is required and must be a string" }, 400);
    }

    // Validate refreshIntervalMinutes
    if (refreshIntervalMinutes === null || refreshIntervalMinutes === undefined) {
      return json({ error: "refreshIntervalMinutes is required" }, 400);
    }

    const minutes = Number(refreshIntervalMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) {
      return json(
        {
          error:
            "refreshIntervalMinutes must be a number between 1 and 720 (minutes)",
        },
        400
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
          400
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
          400
        );
      }
      gcTimeMinutes = Math.round(gcTime);
    }

    const now = new Date().toISOString();

    // Check if settings already exist for user
    const existing = await env.stockly
      .prepare(`SELECT user_id FROM user_settings WHERE user_id = ?`)
      .bind(userId)
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
           WHERE user_id = ?`
        )
        .bind(roundedMinutes, staleTimeMinutes, gcTimeMinutes, now, userId)
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
      });
    } else {
      // Insert new settings
      await env.stockly
        .prepare(
          `INSERT INTO user_settings (user_id, refresh_interval_minutes, cache_stale_time_minutes, cache_gc_time_minutes, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(userId, roundedMinutes, staleTimeMinutes, gcTimeMinutes, now)
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
        201
      );
    }
  } catch (error) {
    console.error("Failed to update settings:", error);
    return json({ error: "Failed to update settings" }, 500);
  }
}

