import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";

interface PushTokenPayload {
  token: string;
  deviceInfo?: string;
}

/**
 * Register or update a user's push token
 * POST /v1/api/push-token
 * userId is extracted from JWT authentication
 */
export async function registerPushToken(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, request);
  }

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

  const userId = auth.userId;

  let payload: PushTokenPayload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON payload" }, 400, request);
  }

  const { token, deviceInfo } = payload;

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return json({ error: "token is required" }, 400, request);
  }

  // Reject old Expo tokens explicitly
  if (token.startsWith("ExponentPushToken[")) {
    return json({ 
      error: "Expo push tokens are no longer supported. Please use the mobile app to register a new FCM token. The app will automatically get a new token when you open it." 
    }, 400, request);
  }

  // Validate FCM token format
  // FCM tokens can vary in format:
  // - Android: Usually long alphanumeric strings (100+ chars)
  // - iOS: Can be shorter or have different format
  // - Expo may return tokens with colons or other separators
  // We'll be more lenient: at least 20 characters, allow alphanumeric, hyphens, underscores, and colons
  if (token.length < 20) {
    return json({ error: `Invalid FCM token format: token too short (${token.length} chars, minimum 20)` }, 400, request);
  }
  
  // Allow alphanumeric, hyphens, underscores, colons, and dots (common in FCM tokens)
  if (!/^[A-Za-z0-9_\-:\.]+$/.test(token)) {
    return json({ error: `Invalid FCM token format: contains invalid characters. Token: ${token.substring(0, 50)}...` }, 400, request);
  }
  
  console.log(`✅ FCM token validation passed: length=${token.length}, format valid`);

  const now = new Date().toISOString();

  try {
    // Check if this exact token already exists (same device re-registering)
    const existingToken = await env.stockly
      .prepare("SELECT id, user_id FROM user_push_tokens WHERE push_token = ?")
      .bind(token)
      .first<{ id: number; user_id: string }>();

    if (existingToken) {
      // Token already exists - update it (device info might have changed)
      if (existingToken.user_id !== userId) {
        // Token belongs to a different user - update to current user
        await env.stockly
          .prepare(
            `UPDATE user_push_tokens 
             SET user_id = ?, device_info = ?, updated_at = ?
             WHERE push_token = ?`
          )
          .bind(userId, deviceInfo || null, now, token)
          .run();

        return json({
          success: true,
          message: "Push token reassigned to current user",
          userId,
        }, 200, request);
      } else {
        // Same user, same token - just update device info and timestamp
        await env.stockly
          .prepare(
            `UPDATE user_push_tokens 
             SET device_info = ?, updated_at = ?
             WHERE push_token = ?`
          )
          .bind(deviceInfo || null, now, token)
          .run();

        return json({
          success: true,
          message: "Push token updated",
          userId,
        }, 200, request);
      }
    } else {
      // New token - insert as new device for this user
      await env.stockly
        .prepare(
          `INSERT INTO user_push_tokens (user_id, push_token, device_info, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(userId, token, deviceInfo || null, now, now)
        .run();

      return json({
        success: true,
        message: "Push token registered",
        userId,
      }, 201, request);
    }
  } catch (error) {
    logger.error("Failed to register push token", error, { userId });
    return json({ error: "Failed to register push token" }, 500, request);
  }
}

/**
 * Get a user's push token
 * GET /v1/api/push-token
 * userId from JWT authentication
 */
export async function getPushToken(
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

  const userId = auth.userId;

  try {
    const row = await env.stockly
      .prepare(
        `SELECT user_id, push_token, device_info, created_at, updated_at 
         FROM user_push_tokens 
         WHERE user_id = ?`
      )
      .bind(userId)
      .first<{
        user_id: string;
        push_token: string;
        device_info: string | null;
        created_at: string;
        updated_at: string;
      }>();

    if (!row) {
      return json({ error: "Push token not found" }, 404, request);
    }

    return json({
      userId: row.user_id,
      pushToken: row.push_token,
      deviceInfo: row.device_info,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, 200, request);
  } catch (error) {
    logger.error("Failed to get push token", error, { userId });
    return json({ error: "Failed to get push token" }, 500, request);
  }
}

