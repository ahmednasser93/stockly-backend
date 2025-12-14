import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  quietStart?: string | null;
  quietEnd?: string | null;
  allowedSymbols?: string[] | null;
  maxDaily?: number | null;
  updatedAt: string;
}

/**
 * GET /v1/api/preferences
 * Retrieve notification preferences (userId from JWT)
 */
export async function getPreferences(
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

    const row = await env.stockly
      .prepare(
        `SELECT user_id, enabled, quiet_start, quiet_end, allowed_symbols, max_daily, updated_at
         FROM user_notification_preferences WHERE username = ?`
      )
      .bind(username)
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
      return json(preferences, 200, request);
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
      return json(defaultPreferences, 200, request);
    }
  } catch (error) {
    logger.error("Failed to retrieve preferences", error, { username });
    return json({ error: "Failed to retrieve preferences" }, 500, request);
  }
}

export async function updatePreferences(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  // Authenticate request to get username
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
    const { enabled, quietStart, quietEnd, allowedSymbols, maxDaily } = payload;
    // userId is from JWT authentication, not from payload

    // Validate enabled is boolean
    if (typeof enabled !== "boolean") {
      return json({ error: "enabled must be a boolean" }, 400, request);
    }

    // Validate quietStart and quietEnd if provided
    if (quietStart && typeof quietStart !== "string") {
      return json({ error: "quietStart must be a string (HH:MM format)" }, 400, request);
    }
    if (quietEnd && typeof quietEnd !== "string") {
      return json({ error: "quietEnd must be a string (HH:MM format)" }, 400, request);
    }

    // Validate maxDaily if provided
    if (maxDaily !== null && maxDaily !== undefined) {
      if (typeof maxDaily !== "number" || maxDaily < 0) {
        return json(
          { error: "maxDaily must be a non-negative number" },
          400,
          request
        );
      }
    }

    // Validate allowedSymbols if provided
    let symbolsString: string | null = null;
    if (allowedSymbols) {
      if (!Array.isArray(allowedSymbols)) {
        return json({ error: "allowedSymbols must be an array" }, 400, request);
      }
      symbolsString = allowedSymbols.join(",");
    }

    const now = new Date().toISOString();

    // Check if preferences already exist for user (by username)
    const existing = await env.stockly
      .prepare(`SELECT user_id FROM user_notification_preferences WHERE username = ?`)
      .bind(username)
      .first();

    if (existing) {
      // Update existing preferences
      await env.stockly
        .prepare(
          `UPDATE user_notification_preferences
           SET enabled = ?, quiet_start = ?, quiet_end = ?, allowed_symbols = ?, max_daily = ?, updated_at = ?
           WHERE username = ?`
        )
        .bind(
          enabled ? 1 : 0,
          quietStart || null,
          quietEnd || null,
          symbolsString,
          maxDaily ?? null,
          now,
          username
        )
        .run();
      return json({ success: true, message: "Preferences updated" }, 200, request);
    } else {
      // Insert new preferences (with both user_id and username)
      await env.stockly
        .prepare(
          `INSERT INTO user_notification_preferences (user_id, username, enabled, quiet_start, quiet_end, allowed_symbols, max_daily, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          userId,
          username,
          enabled ? 1 : 0,
          quietStart || null,
          quietEnd || null,
          symbolsString,
          maxDaily ?? null,
          now
        )
        .run();
      return json({ success: true, message: "Preferences created" }, 201, request);
    }
  } catch (error) {
    logger.error("Failed to update preferences", error, { username });
    return json({ error: "Failed to update preferences" }, 500, request);
  }
}

