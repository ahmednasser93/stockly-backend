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
 * Generate device identifier from user_id and device_info
 * Uses SHA-256 hash for consistent device identification
 */
async function generateDeviceIdentifier(userId: string, deviceInfo: string | null | undefined): Promise<string> {
  const input = `${userId}|${deviceInfo || 'unknown'}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32); // Use first 32 chars (64 hex chars = 256 bits)
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

    // Generate device identifier for device matching
    const deviceIdentifier = await generateDeviceIdentifier(userId, deviceInfo);

    // Step 1: Find or create device
    // Check if device exists by device_identifier OR (user_id + device_info)
    let device = await env.stockly
      .prepare(
        `SELECT id, user_id, device_info, device_type, is_active 
         FROM devices 
         WHERE device_identifier = ? OR (user_id = ? AND device_info = ?)`
      )
      .bind(deviceIdentifier, userId, deviceInfo || null)
      .first<{ id: number; user_id: string; device_info: string | null; device_type: string | null; is_active: number }>();

    let deviceId: number;
    if (device) {
      // Device exists - update it
      deviceId = device.id;
      logger.info("Updating existing device", {
        username,
        userId,
        deviceId,
        deviceType: normalizedDeviceType,
      });

      await env.stockly
        .prepare(
          `UPDATE devices 
           SET device_info = ?, device_type = ?, last_seen_at = ?, is_active = 1, updated_at = ?
           WHERE id = ?`
        )
        .bind(deviceInfo || null, normalizedDeviceType, now, now, deviceId)
        .run();
    } else {
      // Device doesn't exist - create new device
      logger.info("Creating new device", {
        username,
        userId,
        deviceType: normalizedDeviceType,
        deviceIdentifier: deviceIdentifier.substring(0, 16) + "...",
      });

      const result = await env.stockly
        .prepare(
          `INSERT INTO devices (user_id, device_identifier, device_info, device_type, is_active, last_seen_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .bind(userId, deviceIdentifier, deviceInfo || null, normalizedDeviceType, now, now, now)
        .run();

      deviceId = result.meta.last_row_id!;
    }

    // Step 2: Find or create push token
    // Check if push token exists
    const existingToken = await env.stockly
      .prepare(
        `SELECT id, device_id, is_active 
         FROM device_push_tokens 
         WHERE push_token = ?`
      )
      .bind(token)
      .first<{ id: number; device_id: number; is_active: number }>();

    if (existingToken) {
      // Token exists
      if (existingToken.device_id !== deviceId) {
        // Token is linked to different device - update to current device
        logger.info("Reassigning push token to different device", {
          username,
          userId,
          deviceId,
          previousDeviceId: existingToken.device_id,
        });

        await env.stockly
          .prepare(
            `UPDATE device_push_tokens 
             SET device_id = ?, is_active = 1, updated_at = ?
             WHERE push_token = ?`
          )
          .bind(deviceId, now, token)
          .run();
      } else {
        // Token is linked to same device - just update timestamp and ensure active
        logger.info("Updating existing push token", {
          username,
          userId,
          deviceId,
        });

        await env.stockly
          .prepare(
            `UPDATE device_push_tokens 
             SET is_active = 1, updated_at = ?
             WHERE push_token = ?`
          )
          .bind(now, token)
          .run();
      }
    } else {
      // Token doesn't exist - create new push token
      logger.info("Creating new push token", {
        username,
        userId,
        deviceId,
        tokenPreview: token.substring(0, 20) + "...",
      });

      await env.stockly
        .prepare(
          `INSERT INTO device_push_tokens (device_id, push_token, is_active, created_at, updated_at)
           VALUES (?, ?, 1, ?, ?)`
        )
        .bind(deviceId, token, now, now)
        .run();
    }

    // Step 3: Verify and return response
    const deviceRecord = await env.stockly
      .prepare(
        `SELECT d.id, d.user_id, d.device_info, d.device_type, dpt.push_token
         FROM devices d
         INNER JOIN device_push_tokens dpt ON d.id = dpt.device_id
         WHERE dpt.push_token = ?`
      )
      .bind(token)
      .first<{ id: number; user_id: string; device_info: string | null; device_type: string | null; push_token: string }>();

    if (!deviceRecord || deviceRecord.user_id !== userId) {
      logger.error("Device verification failed", {
        username,
        userId,
        device: deviceRecord,
      });
      return json({ error: "Failed to verify device registration" }, 500, request);
    }

    logger.info("Push token registered successfully", {
      username,
      userId,
      deviceId: deviceRecord.id,
      deviceType: deviceRecord.device_type,
    });

    return json({
      success: true,
      message: existingToken ? "Push token updated" : "Push token registered",
      username,
      device: {
        deviceId: deviceRecord.id,
        pushToken: deviceRecord.push_token,
        deviceInfo: deviceRecord.device_info,
        deviceType: deviceRecord.device_type,
      },
    }, existingToken ? 200 : 201, request);
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
      const tokenRecord = await env.stockly
        .prepare(
          `SELECT d.user_id 
           FROM device_push_tokens dpt
           INNER JOIN devices d ON dpt.device_id = d.id
           WHERE dpt.push_token = ? AND d.user_id = ? AND dpt.is_active = 1`
        )
        .bind(pushToken, userId)
        .first<{ user_id: string }>();

      const registered = tokenRecord !== null;

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

    // Full mode: return all devices with their push tokens
    const rows = await env.stockly
      .prepare(
        `SELECT 
           d.id as device_id,
           d.device_info,
           d.device_type,
           dpt.push_token,
           dpt.created_at,
           dpt.updated_at
         FROM devices d
         INNER JOIN device_push_tokens dpt ON d.id = dpt.device_id
         WHERE d.user_id = ? AND dpt.is_active = 1
         ORDER BY dpt.updated_at DESC`
      )
      .bind(userId)
      .all<{
        device_id: number;
        device_info: string | null;
        device_type: string | null;
        push_token: string;
        created_at: string;
        updated_at: string;
      }>();

    if (!rows.results || rows.results.length === 0) {
      return json({ error: "Push tokens not found" }, 404, request);
    }

    // Group by device and return all push tokens per device
    const devicesMap = new Map<number, {
      deviceId: number;
      deviceInfo: string | null;
      deviceType: string | null;
      pushTokens: Array<{
        pushToken: string;
        createdAt: string;
        updatedAt: string;
      }>;
    }>();

    for (const row of rows.results) {
      if (!devicesMap.has(row.device_id)) {
        devicesMap.set(row.device_id, {
          deviceId: row.device_id,
          deviceInfo: row.device_info,
          deviceType: row.device_type,
          pushTokens: [],
        });
      }
      devicesMap.get(row.device_id)!.pushTokens.push({
        pushToken: row.push_token,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    // Return all devices for this username
    return json({
      username,
      devices: Array.from(devicesMap.values()),
    }, 200, request);
  } catch (error) {
    logger.error("Failed to get push tokens", error, { username, userId });
    return json({ error: "Failed to get push tokens" }, 500, request);
  }
}

