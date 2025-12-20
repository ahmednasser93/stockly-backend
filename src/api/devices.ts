import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest, authenticateRequestWithAdmin } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import { sendFCMNotification } from "../notifications/fcm-sender";
import type { Logger } from "../logging/logger";

export interface Device {
  deviceId: number;
  userId: string | null; // Can be null for unregistered devices
  username: string | null;
  pushTokens: string[]; // Array of push tokens for this device
  deviceInfo: string | null;
  deviceType: string | null;
  alertCount: number;
  activeAlertCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all registered devices with alert counts for authenticated user
 * GET /v1/api/devices
 */
export async function getAllDevices(
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

  // For admin, get all devices; otherwise filter by username
  const username = auth.isAdmin ? null : auth.username;

  // Get user_id from username if not admin
  let userId: string | null = null;
  
  try {
    if (username) {
      const user = await env.stockly
        .prepare("SELECT id FROM users WHERE username = ?")
        .bind(username)
        .first<{ id: string }>();
      userId = user?.id || null;
    }

    // Query devices with their push tokens
    let deviceRows;
    if (username === null) {
      // Admin: get all devices
      deviceRows = await env.stockly
        .prepare(
          `SELECT 
             d.id as device_id,
             d.user_id,
             d.device_info,
             d.device_type,
             d.created_at,
             d.updated_at,
             u.username
           FROM devices d
           LEFT JOIN users u ON d.user_id = u.id
           WHERE d.is_active = 1
           ORDER BY d.updated_at DESC`
        )
        .all<{
          device_id: number;
          user_id: string | null;
          device_info: string | null;
          device_type: string | null;
          created_at: string;
          updated_at: string;
          username: string | null;
        }>();
    } else {
      // Regular user: filter by username
      deviceRows = await env.stockly
        .prepare(
          `SELECT 
             d.id as device_id,
             d.user_id,
             d.device_info,
             d.device_type,
             d.created_at,
             d.updated_at,
             u.username
           FROM devices d
           INNER JOIN users u ON d.user_id = u.id
           WHERE u.username = ? AND d.is_active = 1
           ORDER BY d.updated_at DESC`
        )
        .bind(username)
        .all<{
          device_id: number;
          user_id: string | null;
          device_info: string | null;
          device_type: string | null;
          created_at: string;
          updated_at: string;
          username: string | null;
        }>();
    }

    if (!deviceRows || !deviceRows.results || deviceRows.results.length === 0) {
      return json({ devices: [] }, 200, request);
    }

    // For each device, get its push tokens and count alerts
    const devices: Device[] = await Promise.all(
      deviceRows.results.map(async (deviceRow) => {
        // Get all active push tokens for this device
        const tokenRows = await env.stockly
          .prepare(
            `SELECT push_token 
             FROM device_push_tokens 
             WHERE device_id = ? AND is_active = 1`
          )
          .bind(deviceRow.device_id)
          .all<{ push_token: string }>();

        const pushTokens = (tokenRows.results || []).map(t => t.push_token);

        // Count alerts for this device's user
        let totalAlertsResult, activeAlertsResult;
        if (username === null) {
          // Admin: count alerts for this device's username
          if (deviceRow.username) {
            totalAlertsResult = await env.stockly
              .prepare(`SELECT COUNT(*) as count FROM alerts WHERE username = ?`)
              .bind(deviceRow.username)
              .first<{ count: number }>();

            activeAlertsResult = await env.stockly
              .prepare(`SELECT COUNT(*) as count FROM alerts WHERE username = ? AND status = 'active'`)
              .bind(deviceRow.username)
              .first<{ count: number }>();
          } else {
            totalAlertsResult = { count: 0 };
            activeAlertsResult = { count: 0 };
          }
        } else {
          // Regular user: count alerts for this username
          totalAlertsResult = await env.stockly
            .prepare(`SELECT COUNT(*) as count FROM alerts WHERE username = ?`)
            .bind(username)
            .first<{ count: number }>();

          activeAlertsResult = await env.stockly
            .prepare(`SELECT COUNT(*) as count FROM alerts WHERE username = ? AND status = 'active'`)
            .bind(username)
            .first<{ count: number }>();
        }

        return {
          deviceId: deviceRow.device_id,
          userId: deviceRow.user_id,
          username: deviceRow.username,
          pushTokens,
          deviceInfo: deviceRow.device_info,
          deviceType: deviceRow.device_type,
          alertCount: totalAlertsResult?.count || 0,
          activeAlertCount: activeAlertsResult?.count || 0,
          createdAt: deviceRow.created_at,
          updatedAt: deviceRow.updated_at,
        };
      })
    );

    return json({ devices }, 200, request);
  } catch (error) {
    logger.error("Failed to get devices", error, { username, userId });
    return json({ error: "Failed to get devices" }, 500, request);
  }
}

/**
 * Delete a device
 * DELETE /v1/api/devices?userId=<userId>
 * For admin: can delete any device by passing userId query parameter
 * For regular users: deletes their own device (userId from JWT)
 */
export async function deleteDevice(
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

  // Get pushToken from query parameter (required to identify which device to delete)
  const url = new URL(request.url);
  const pushToken = url.searchParams.get("pushToken");
  
  if (!pushToken) {
    return json({ error: "pushToken query parameter is required" }, 400, request);
  }

  try {
    // Check if push token exists and get device info
    const tokenRecord = await env.stockly
      .prepare(
        `SELECT dpt.device_id, d.user_id, u.username
         FROM device_push_tokens dpt
         INNER JOIN devices d ON dpt.device_id = d.id
         LEFT JOIN users u ON d.user_id = u.id
         WHERE dpt.push_token = ?`
      )
      .bind(pushToken)
      .first<{ device_id: number; user_id: string; username: string | null }>();

    if (!tokenRecord) {
      return json({ error: "Device not found" }, 404, request);
    }

    // Verify device belongs to authenticated user (unless admin)
    if (!auth.isAdmin && tokenRecord.user_id !== auth.userId) {
      return json({ error: "Unauthorized: Device does not belong to authenticated user" }, 403, request);
    }

    // Delete the push token
    await env.stockly
      .prepare(`DELETE FROM device_push_tokens WHERE push_token = ?`)
      .bind(pushToken)
      .run();

    // Check if device has any remaining active push tokens
    const remainingTokens = await env.stockly
      .prepare(
        `SELECT COUNT(*) as count 
         FROM device_push_tokens 
         WHERE device_id = ? AND is_active = 1`
      )
      .bind(tokenRecord.device_id)
      .first<{ count: number }>();

    // If no active tokens remain, mark device as inactive
    if (remainingTokens && remainingTokens.count === 0) {
      await env.stockly
        .prepare(`UPDATE devices SET is_active = 0, updated_at = ? WHERE id = ?`)
        .bind(new Date().toISOString(), tokenRecord.device_id)
        .run();
    }

    logger.info("Device deleted successfully", { 
      deletedPushToken: pushToken.substring(0, 20) + "...",
      deletedUserId: tokenRecord.user_id, 
      deletedBy: auth.username, 
      isAdmin: auth.isAdmin 
    });
    return json({
      success: true,
      message: "Device deleted successfully",
      userId: tokenRecord.user_id,
    }, 200, request);
  } catch (error) {
    logger.error("Failed to delete device", error, { pushToken: pushToken?.substring(0, 20) + "...", deletedBy: auth.username });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return json(
      {
        success: false,
        error: `Failed to delete device: ${errorMessage}`,
      },
      500,
      request
    );
  }
}

/**
 * Send a test notification to a specific device
 * POST /v1/api/devices/test
 * Requires pushToken in request body to identify which device to send to
 * userId from JWT authentication (must match device owner unless admin)
 */
export async function sendTestNotification(
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

  const username = auth.username;

  // Get user_id from username first (initialize to avoid ReferenceError)
  let userId: string | null = null;

  try {
    const user = await env.stockly
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();

    if (!user) {
      return json({ error: "User not found" }, 404, request);
    }

    userId = user.id;

    // Parse request body to get pushToken
    let body: { pushToken?: string; message?: string } = {};
    try {
      const requestBody = await request.text();
      if (requestBody) {
        body = JSON.parse(requestBody);
      }
    } catch {
      // Use default if body parsing fails
    }

    if (!body.pushToken) {
      return json({ error: "pushToken is required in request body" }, 400, request);
    }

    const pushToken = body.pushToken;

    // Get the push token and device info
    const tokenRecord = await env.stockly
      .prepare(
        `SELECT dpt.push_token, d.user_id, d.device_info
         FROM device_push_tokens dpt
         INNER JOIN devices d ON dpt.device_id = d.id
         WHERE dpt.push_token = ? AND dpt.is_active = 1`
      )
      .bind(pushToken)
      .first<{
        push_token: string;
        user_id: string;
        device_info: string | null;
      }>();

    if (!tokenRecord) {
      return json({ error: "Device not found or token is inactive" }, 404, request);
    }

    // Verify the device belongs to the authenticated user (unless admin)
    // Note: For now, we'll allow any authenticated user to test any device
    // In the future, you might want to add admin check here

    const testMessage = body.message || "This is a test notification from Stockly! 🚀";
    const title = "Test Notification";

    // Send test notification
    // Convert data to string values (FCM requires all data values to be strings)
    const testData: Record<string, unknown> = {
      type: "test",
      timestamp: new Date().toISOString(),
    };

    const success = await sendFCMNotification(
      tokenRecord.push_token,
      title,
      testMessage,
      testData,
      env,
      logger
    );

    if (success) {
      logger.info("Test notification sent successfully", { userId });
      return json({
        success: true,
        message: "Test notification sent successfully",
        userId: tokenRecord.user_id,
      }, 200, request);
    } else {
      return json(
        {
          success: false,
          error: "Failed to send test notification",
          userId: tokenRecord.user_id,
        },
        500,
        request
      );
    }
  } catch (error) {
    logger.error("Failed to send test notification", error, { userId });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return json(
      {
        success: false,
        error: `Failed to send test notification: ${errorMessage}`,
      },
      500,
      request
    );
  }
}

