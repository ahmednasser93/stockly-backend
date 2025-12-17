import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";

interface PushTokenPayload {
  token: string;
  deviceInfo?: string;
  deviceType?: string; // 'android', 'ios', 'web', 'unknown'
}

/**
 * Register or update a user's push token
 * POST /v1/api/push-token
 * username is extracted from JWT authentication
 */
export async function registerPushToken(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, request);
  }

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
  let userId: string | undefined;

  let payload: PushTokenPayload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON payload" }, 400, request);
  }

  const { token, deviceInfo, deviceType } = payload;

  try {
    // Validate user exists and get user_id - this ensures data consistency
    const user = await env.stockly
      .prepare("SELECT id, username FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string; username: string }>();

    if (!user) {
      logger.error("User not found during device registration", { username });
      return json({ error: "User not found" }, 404, request);
    }

    // Verify username matches (extra validation)
    if (user.username !== username) {
      logger.error("Username mismatch during device registration", {
        requestedUsername: username,
        dbUsername: user.username
      });
      return json({ error: "User validation failed" }, 400, request);
    }

    userId = user.id;

    // Validate and normalize device_type
    let normalizedDeviceType: string = 'unknown';
    if (deviceType) {
      const lowerType = deviceType.toLowerCase();
      if (['android', 'ios', 'web'].includes(lowerType)) {
        normalizedDeviceType = lowerType;
      } else {
        normalizedDeviceType = 'unknown';
      }
    } else if (deviceInfo) {
      // Try to extract from device_info if deviceType not provided
      const lowerInfo = deviceInfo.toLowerCase();
      if (lowerInfo.includes('android')) {
        normalizedDeviceType = 'android';
      } else if (lowerInfo.includes('ios') || lowerInfo.includes('iphone') || lowerInfo.includes('ipad')) {
        normalizedDeviceType = 'ios';
      } else if (lowerInfo.includes('web') || lowerInfo.includes('chrome') || lowerInfo.includes('firefox') || lowerInfo.includes('safari')) {
        normalizedDeviceType = 'web';
      }
    }

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


    // Check if this exact token already exists (same device re-registering)
    const existingToken = await env.stockly
      .prepare("SELECT id, user_id FROM user_push_tokens WHERE push_token = ?")
      .bind(token)
      .first<{ id: number; user_id: string | null }>();

    if (existingToken) {
      // Token already exists - update it (device info and device_type might have changed)
      if (existingToken.user_id !== userId) {
        // Token belongs to a different user - update to current user
        // Store username directly to avoid JOIN dependency
        logger.info("Reassigning push token to different user", {
          username,
          userId,
          previousUserId: existingToken.user_id,
          deviceType: normalizedDeviceType,
        });

        // Try to update device_type if column exists, otherwise skip it
        try {
          await env.stockly
            .prepare(
              `UPDATE user_push_tokens 
               SET user_id = ?, username = ?, device_info = ?, device_type = ?, updated_at = ?
               WHERE push_token = ?`
            )
            .bind(userId, username, deviceInfo || null, normalizedDeviceType, now, token)
            .run();
        } catch (error) {
          // If device_type column doesn't exist, update without it
          if (error instanceof Error && error.message.includes('device_type')) {
            await env.stockly
              .prepare(
                `UPDATE user_push_tokens 
                 SET user_id = ?, username = ?, device_info = ?, updated_at = ?
                 WHERE push_token = ?`
              )
              .bind(userId, username, deviceInfo || null, now, token)
              .run();
          } else {
            throw error;
          }
        }

        // Verify device was updated correctly
        const updatedDevice = await env.stockly
          .prepare("SELECT user_id, username, push_token, device_info, device_type FROM user_push_tokens WHERE push_token = ?")
          .bind(token)
          .first<{ user_id: string; username: string | null; push_token: string; device_info: string | null; device_type: string | null }>();

        if (!updatedDevice || updatedDevice.user_id !== userId || updatedDevice.username !== username) {
          logger.error("Device update verification failed", {
            username,
            userId,
            device: updatedDevice
          });
          return json({ error: "Failed to verify device update" }, 500, request);
        }

        logger.info("Push token reassigned successfully", { username, userId, deviceType: normalizedDeviceType });

        return json({
          success: true,
          message: "Push token reassigned to current user",
          username,
          device: {
            pushToken: updatedDevice.push_token,
            deviceInfo: updatedDevice.device_info,
            deviceType: updatedDevice.device_type,
          },
        }, 200, request);
      } else {
        // Same user, same token - just update device info, device_type and timestamp
        // Ensure username is also updated (in case username changed)
        logger.info("Updating existing push token", {
          username,
          userId,
          deviceType: normalizedDeviceType,
        });

        // Try to update device_type if column exists, otherwise skip it
        try {
          await env.stockly
            .prepare(
              `UPDATE user_push_tokens 
               SET username = ?, device_info = ?, device_type = ?, updated_at = ?
               WHERE push_token = ?`
            )
            .bind(username, deviceInfo || null, normalizedDeviceType, now, token)
            .run();
        } catch (error) {
          // If device_type column doesn't exist, update without it
          if (error instanceof Error && error.message.includes('device_type')) {
            await env.stockly
              .prepare(
                `UPDATE user_push_tokens 
                 SET username = ?, device_info = ?, updated_at = ?
                 WHERE push_token = ?`
              )
              .bind(username, deviceInfo || null, now, token)
              .run();
          } else {
            throw error;
          }
        }

        // Verify device was updated correctly
        const updatedDevice = await env.stockly
          .prepare("SELECT user_id, username, push_token, device_info, device_type FROM user_push_tokens WHERE push_token = ?")
          .bind(token)
          .first<{ user_id: string; username: string | null; push_token: string; device_info: string | null; device_type: string | null }>();

        if (!updatedDevice || updatedDevice.username !== username) {
          logger.error("Device update verification failed", {
            username,
            userId,
            device: updatedDevice
          });
          return json({ error: "Failed to verify device update" }, 500, request);
        }

        logger.info("Push token updated successfully", { username, userId, deviceType: normalizedDeviceType });

        return json({
          success: true,
          message: "Push token updated",
          username,
          device: {
            pushToken: updatedDevice.push_token,
            deviceInfo: updatedDevice.device_info,
            deviceType: updatedDevice.device_type,
          },
        }, 200, request);
      }
    } else {
      // New token - insert as new device for this user
      // Store username directly to avoid JOIN dependency and ensure data consistency
      logger.info("Registering new push token", {
        username,
        userId,
        deviceType: normalizedDeviceType,
        tokenPreview: token.substring(0, 20) + "...",
      });

      // Try to insert with device_type if column exists, otherwise insert without it
      try {
        await env.stockly
          .prepare(
            `INSERT INTO user_push_tokens (user_id, username, push_token, device_info, device_type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(userId, username, token, deviceInfo || null, normalizedDeviceType, now, now)
          .run();
      } catch (error) {
        // If device_type column doesn't exist, insert without it
        if (error instanceof Error && error.message.includes('device_type')) {
          await env.stockly
            .prepare(
              `INSERT INTO user_push_tokens (user_id, username, push_token, device_info, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(userId, username, token, deviceInfo || null, now, now)
            .run();
        } else {
          logger.error("Failed to insert push token", error, { username, userId, deviceType: normalizedDeviceType });
          throw error;
        }
      }

      // Verify device was created correctly
      const newDevice = await env.stockly
        .prepare("SELECT user_id, username, push_token, device_info, device_type FROM user_push_tokens WHERE push_token = ?")
        .bind(token)
        .first<{ user_id: string; username: string | null; push_token: string; device_info: string | null; device_type: string | null }>();

      if (!newDevice || newDevice.user_id !== userId || newDevice.username !== username) {
        logger.error("Device creation verification failed", {
          username,
          userId,
          device: newDevice
        });
        return json({ error: "Failed to verify device creation" }, 500, request);
      }

      logger.info("Push token registered successfully", {
        username,
        userId,
        deviceType: normalizedDeviceType,
        deviceId: newDevice.push_token.substring(0, 20) + "...",
      });

      return json({
        success: true,
        message: "Push token registered",
        username,
        device: {
          pushToken: newDevice.push_token,
          deviceInfo: newDevice.device_info,
          deviceType: newDevice.device_type,
        },
      }, 201, request);
    }
  } catch (error) {
    logger.error("Failed to register push token", error, { username, userId });
    return json({ error: "Failed to register push token" }, 500, request);
  }
}

/**
 * Get a user's push tokens (all devices)
 * GET /v1/api/push-token
 * GET /v1/api/push-token?check=true&token=<pushToken> (quick check mode - returns { registered: boolean })
 *   - Checks if the specific push token is registered for the authenticated user
 * username from JWT authentication
 */
export async function getPushToken(
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
  let userId: string | undefined;

  try {
    // Get user_id from username first
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();

    if (!user) {
      return json({ error: "User not found" }, 404, request);
    }

    userId = user.id;

    // Check if this is a quick check request
    const url = new URL(request.url);
    const isQuickCheck = url.searchParams.get("check") === "true";
    if (isQuickCheck) {
      // Quick check mode: check if specific token is registered for this user
      const pushToken = url.searchParams.get("token");
      
      if (!pushToken) {
        return json({ error: "token parameter required for check mode" }, 400, request);
      }

      // Check if this specific token is registered for this user
      const device = await env.stockly
        .prepare(
          `SELECT user_id FROM user_push_tokens WHERE push_token = ? AND user_id = ?`
        )
        .bind(pushToken, userId)
        .first<{ user_id: string }>();

      // If device is found, it means the token is registered for this user
      // (query already filtered by user_id, so device.user_id === userId is always true if device is not null)
      const registered = device !== null;

      logger.debug("Device registration check", {
        username,
        userId,
        pushToken: pushToken.substring(0, 20) + "...",
        registered,
      });

      return json({
        registered,
      }, 200, request);
    }

    // Full mode: return all devices
    // Try to select device_type if column exists, otherwise select without it
    let rows;
    try {
      rows = await env.stockly
        .prepare(
          `SELECT push_token, device_info, device_type, created_at, updated_at 
           FROM user_push_tokens 
           WHERE user_id = ?
           ORDER BY updated_at DESC`
        )
        .bind(userId)
        .all<{
          push_token: string;
          device_info: string | null;
          device_type: string | null;
          created_at: string;
          updated_at: string;
        }>();
    } catch (error) {
      // If device_type column doesn't exist, select without it
      if (error instanceof Error && error.message.includes('device_type')) {
        rows = await env.stockly
          .prepare(
            `SELECT push_token, device_info, created_at, updated_at 
             FROM user_push_tokens 
             WHERE user_id = ?
             ORDER BY updated_at DESC`
          )
          .bind(userId)
          .all<{
            push_token: string;
            device_info: string | null;
            created_at: string;
            updated_at: string;
          }>();
      } else {
        throw error;
      }
    }

    if (!rows.results || rows.results.length === 0) {
      return json({ error: "Push tokens not found" }, 404, request);
    }

    // Return all devices for this username
    return json({
      username,
      devices: rows.results.map(row => ({
        pushToken: row.push_token,
        deviceInfo: row.device_info,
        deviceType: 'device_type' in row ? (row as any).device_type : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    }, 200, request);
  } catch (error) {
    logger.error("Failed to get push tokens", error, { username, userId });
    return json({ error: "Failed to get push tokens" }, 500, request);
  }
}

