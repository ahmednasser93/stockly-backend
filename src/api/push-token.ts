import { json } from "../util";
import type { Env } from "../index";

interface PushTokenPayload {
  userId: string;
  token: string;
  deviceInfo?: string;
}

/**
 * Register or update a user's Expo push token
 * POST /v1/api/push-token
 */
import type { Logger } from "../logging/logger";

export async function registerPushToken(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let payload: PushTokenPayload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const { userId, token, deviceInfo } = payload;

  // Validate required fields
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    return json({ error: "userId is required" }, 400);
  }

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return json({ error: "token is required" }, 400);
  }

  // Reject old Expo tokens explicitly
  if (token.startsWith("ExponentPushToken[")) {
    return json({ 
      error: "Expo push tokens are no longer supported. Please use the mobile app to register a new FCM token. The app will automatically get a new token when you open it." 
    }, 400);
  }

  // Validate FCM token format
  // FCM tokens can vary in format:
  // - Android: Usually long alphanumeric strings (100+ chars)
  // - iOS: Can be shorter or have different format
  // - Expo may return tokens with colons or other separators
  // We'll be more lenient: at least 20 characters, allow alphanumeric, hyphens, underscores, and colons
  if (token.length < 20) {
    return json({ error: `Invalid FCM token format: token too short (${token.length} chars, minimum 20)` }, 400);
  }
  
  // Allow alphanumeric, hyphens, underscores, colons, and dots (common in FCM tokens)
  if (!/^[A-Za-z0-9_\-:\.]+$/.test(token)) {
    return json({ error: `Invalid FCM token format: contains invalid characters. Token: ${token.substring(0, 50)}...` }, 400);
  }
  
  console.log(`✅ FCM token validation passed: length=${token.length}, format valid`);

  const now = new Date().toISOString();

  try {
    // Check if user already has a push token registered
    const existing = await env.stockly
      .prepare("SELECT user_id FROM user_push_tokens WHERE user_id = ?")
      .bind(userId)
      .first();

    if (existing) {
      // Update existing token
      await env.stockly
        .prepare(
          `UPDATE user_push_tokens 
           SET push_token = ?, device_info = ?, updated_at = ?
           WHERE user_id = ?`
        )
        .bind(token, deviceInfo || null, now, userId)
        .run();

      return json({
        success: true,
        message: "Push token updated",
        userId,
      });
    } else {
      // Insert new token
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
      }, 201);
    }
  } catch (error) {
    console.error("Failed to register push token:", error);
    return json({ error: "Failed to register push token" }, 500);
  }
}

/**
 * Get a user's push token
 * GET /v1/api/push-token/:userId
 */
export async function getPushToken(
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
      return json({ error: "Push token not found" }, 404);
    }

    return json({
      userId: row.user_id,
      pushToken: row.push_token,
      deviceInfo: row.device_info,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error("Failed to get push token:", error);
    return json({ error: "Failed to get push token" }, 500);
  }
}

