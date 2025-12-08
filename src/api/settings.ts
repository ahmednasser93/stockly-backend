import { json } from "../util";
import type { Env } from "../index";

export interface UserSettings {
  userId: string;
  refreshIntervalMinutes: number;
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
        `SELECT user_id, refresh_interval_minutes, updated_at
         FROM user_settings WHERE user_id = ?`
      )
      .bind(userId)
      .first<{
        user_id: string;
        refresh_interval_minutes: number;
        updated_at: string;
      }>();

    if (row) {
      const settings: UserSettings = {
        userId: row.user_id,
        refreshIntervalMinutes: row.refresh_interval_minutes,
        updatedAt: row.updated_at,
      };
      return json(settings);
    } else {
      // Return default settings if not found
      const defaultSettings: UserSettings = {
        userId,
        refreshIntervalMinutes: 5,
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
    const { userId, refreshIntervalMinutes } = payload;

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
           SET refresh_interval_minutes = ?, updated_at = ?
           WHERE user_id = ?`
        )
        .bind(roundedMinutes, now, userId)
        .run();
      return json({
        success: true,
        message: "Settings updated",
        settings: {
          userId,
          refreshIntervalMinutes: roundedMinutes,
          updatedAt: now,
        },
      });
    } else {
      // Insert new settings
      await env.stockly
        .prepare(
          `INSERT INTO user_settings (user_id, refresh_interval_minutes, updated_at)
           VALUES (?, ?, ?)`
        )
        .bind(userId, roundedMinutes, now)
        .run();
      return json(
        {
          success: true,
          message: "Settings created",
          settings: {
            userId,
            refreshIntervalMinutes: roundedMinutes,
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

