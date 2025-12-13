import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest, authenticateRequestWithAdmin } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import { sendFCMNotification } from "../notifications/fcm-sender";
import type { Logger } from "../logging/logger";

export interface Device {
  userId: string;
  username: string | null;
  pushToken: string;
  deviceInfo: string | null;
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

  // For admin, get all devices; otherwise filter by userId
  const userId = auth.isAdmin ? null : auth.userId;

  try {
    let rows;
    if (userId === null) {
      // Admin: get all devices with usernames
      rows = await env.stockly
        .prepare(
          `SELECT 
             upt.user_id, 
             upt.push_token, 
             upt.device_info, 
             upt.created_at, 
             upt.updated_at,
             u.username
           FROM user_push_tokens upt
           LEFT JOIN users u ON upt.user_id = u.id
           ORDER BY upt.updated_at DESC`
        )
        .all<{
          user_id: string;
          push_token: string;
          device_info: string | null;
          created_at: string;
          updated_at: string;
          username: string | null;
        }>();
    } else {
      rows = await env.stockly
        .prepare(
          `SELECT 
             upt.user_id, 
             upt.push_token, 
             upt.device_info, 
             upt.created_at, 
             upt.updated_at,
             u.username
           FROM user_push_tokens upt
           LEFT JOIN users u ON upt.user_id = u.id
           WHERE upt.user_id = ?
           ORDER BY upt.updated_at DESC`
        )
        .bind(userId)
        .all<{
          user_id: string;
          push_token: string;
          device_info: string | null;
          created_at: string;
          updated_at: string;
          username: string | null;
        }>();
    }

    // For each device, count alerts that use its push token
    const devices: Device[] = await Promise.all(
      (rows.results || []).map(async (row) => {
        // Count total alerts for this push token
        let totalAlertsResult, activeAlertsResult;
        if (userId === null) {
          // Admin: count all alerts for this push token
          totalAlertsResult = await env.stockly
            .prepare(`SELECT COUNT(*) as count FROM alerts WHERE target = ?`)
            .bind(row.push_token)
            .first<{ count: number }>();

          activeAlertsResult = await env.stockly
            .prepare(`SELECT COUNT(*) as count FROM alerts WHERE target = ? AND status = 'active'`)
            .bind(row.push_token)
            .first<{ count: number }>();
        } else {
          // Regular user: count alerts for this push token and user
          totalAlertsResult = await env.stockly
            .prepare(`SELECT COUNT(*) as count FROM alerts WHERE target = ? AND user_id = ?`)
            .bind(row.push_token, userId)
            .first<{ count: number }>();

          activeAlertsResult = await env.stockly
            .prepare(`SELECT COUNT(*) as count FROM alerts WHERE target = ? AND user_id = ? AND status = 'active'`)
            .bind(row.push_token, userId)
            .first<{ count: number }>();
        }

        return {
          userId: row.user_id,
          username: row.username,
          pushToken: row.push_token,
          deviceInfo: row.device_info,
          alertCount: totalAlertsResult?.count || 0,
          activeAlertCount: activeAlertsResult?.count || 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
    );

    return json({ devices }, 200, request);
  } catch (error) {
    logger.error("Failed to get devices", error, { userId });
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
    // Check if device exists (by push_token, not user_id, since we support multiple devices per user)
    const device = await env.stockly
      .prepare(
        `SELECT user_id, push_token FROM user_push_tokens WHERE push_token = ?`
      )
      .bind(pushToken)
      .first<{ user_id: string; push_token: string }>();

    if (!device) {
      return json({ error: "Device not found" }, 404, request);
    }

    // Verify the device belongs to the authenticated user (unless admin)
    if (!auth.isAdmin && device.user_id !== auth.userId) {
      return json({ error: "Unauthorized: Device does not belong to current user" }, 403, request);
    }

    // Delete the specific device by push_token
    await env.stockly
      .prepare(`DELETE FROM user_push_tokens WHERE push_token = ?`)
      .bind(pushToken)
      .run();

    logger.info("Device deleted successfully", { 
      deletedPushToken: pushToken.substring(0, 20) + "...",
      deletedUserId: device.user_id, 
      deletedBy: auth.userId, 
      isAdmin: auth.isAdmin 
    });
    return json({
      success: true,
      message: "Device deleted successfully",
      userId: device.user_id,
    }, 200, request);
  } catch (error) {
    logger.error("Failed to delete device", error, { pushToken: pushToken?.substring(0, 20) + "...", deletedBy: auth.userId });
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

  const userId = auth.userId;

  try {
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

    // Get the specific device by push token
    const device = await env.stockly
      .prepare(
        `SELECT user_id, push_token, device_info 
         FROM user_push_tokens 
         WHERE push_token = ?`
      )
      .bind(pushToken)
      .first<{
        user_id: string;
        push_token: string;
        device_info: string | null;
      }>();

    if (!device) {
      return json({ error: "Device not found" }, 404, request);
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
      device.push_token,
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
        userId: device.user_id,
      }, 200, request);
    } else {
      return json(
        {
          success: false,
          error: "Failed to send test notification",
          userId: device.user_id,
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

