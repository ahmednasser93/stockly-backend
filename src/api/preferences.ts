import { json } from "../util";
import type { Env } from "../index";

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  quietStart?: string | null;
  quietEnd?: string | null;
  allowedSymbols?: string[] | null;
  maxDaily?: number | null;
  updatedAt: string;
}

import type { Logger } from "../logging/logger";

export async function getPreferences(
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
        `SELECT user_id, enabled, quiet_start, quiet_end, allowed_symbols, max_daily, updated_at
         FROM user_notification_preferences WHERE user_id = ?`
      )
      .bind(userId)
      .first<{
        user_id: string;
        enabled: number;
        quiet_start: string | null;
        quiet_end: string | null;
        allowed_symbols: string | null;
        max_daily: number | null;
        updated_at: string;
      }>();

    if (row) {
      const preferences: NotificationPreferences = {
        userId: row.user_id,
        enabled: Boolean(row.enabled),
        quietStart: row.quiet_start,
        quietEnd: row.quiet_end,
        allowedSymbols: row.allowed_symbols
          ? row.allowed_symbols.split(",")
          : null,
        maxDaily: row.max_daily,
        updatedAt: row.updated_at,
      };
      return json(preferences);
    } else {
      // Return default preferences if not found
      const defaultPreferences: NotificationPreferences = {
        userId,
        enabled: true,
        quietStart: null,
        quietEnd: null,
        allowedSymbols: null,
        maxDaily: null,
        updatedAt: new Date().toISOString(),
      };
      return json(defaultPreferences);
    }
  } catch (error) {
    console.error("Failed to retrieve preferences:", error);
    return json({ error: "Failed to retrieve preferences" }, 500);
  }
}

export async function updatePreferences(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const payload = await request.json();
    const { userId, enabled, quietStart, quietEnd, allowedSymbols, maxDaily } =
      payload;

    if (!userId || typeof userId !== "string") {
      return json({ error: "userId is required and must be a string" }, 400);
    }

    // Validate enabled is boolean
    if (typeof enabled !== "boolean") {
      return json({ error: "enabled must be a boolean" }, 400);
    }

    // Validate quietStart and quietEnd if provided
    if (quietStart && typeof quietStart !== "string") {
      return json({ error: "quietStart must be a string (HH:MM format)" }, 400);
    }
    if (quietEnd && typeof quietEnd !== "string") {
      return json({ error: "quietEnd must be a string (HH:MM format)" }, 400);
    }

    // Validate maxDaily if provided
    if (maxDaily !== null && maxDaily !== undefined) {
      if (typeof maxDaily !== "number" || maxDaily < 0) {
        return json(
          { error: "maxDaily must be a non-negative number" },
          400
        );
      }
    }

    // Validate allowedSymbols if provided
    let symbolsString: string | null = null;
    if (allowedSymbols) {
      if (!Array.isArray(allowedSymbols)) {
        return json({ error: "allowedSymbols must be an array" }, 400);
      }
      symbolsString = allowedSymbols.join(",");
    }

    const now = new Date().toISOString();

    // Check if preferences already exist for user
    const existing = await env.stockly
      .prepare(`SELECT user_id FROM user_notification_preferences WHERE user_id = ?`)
      .bind(userId)
      .first();

    if (existing) {
      // Update existing preferences
      await env.stockly
        .prepare(
          `UPDATE user_notification_preferences
           SET enabled = ?, quiet_start = ?, quiet_end = ?, allowed_symbols = ?, max_daily = ?, updated_at = ?
           WHERE user_id = ?`
        )
        .bind(
          enabled ? 1 : 0,
          quietStart || null,
          quietEnd || null,
          symbolsString,
          maxDaily ?? null,
          now,
          userId
        )
        .run();
      return json({ success: true, message: "Preferences updated" });
    } else {
      // Insert new preferences
      await env.stockly
        .prepare(
          `INSERT INTO user_notification_preferences (user_id, enabled, quiet_start, quiet_end, allowed_symbols, max_daily, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          userId,
          enabled ? 1 : 0,
          quietStart || null,
          quietEnd || null,
          symbolsString,
          maxDaily ?? null,
          now
        )
        .run();
      return json({ success: true, message: "Preferences created" }, 201);
    }
  } catch (error) {
    console.error("Failed to update preferences:", error);
    return json({ error: "Failed to update preferences" }, 500);
  }
}

