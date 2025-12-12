import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import { sendFCMNotification } from "../notifications/fcm-sender";
import type { Logger } from "../logging/logger";

export interface Device {
  userId: string;
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
    const rows = await env.stockly
      .prepare(
        `SELECT user_id, push_token, device_info, created_at, updated_at 
         FROM user_push_tokens 
         WHERE user_id = ?
         ORDER BY updated_at DESC`
      )
      .bind(userId)
      .all<{
        user_id: string;
        push_token: string;
        device_info: string | null;
        created_at: string;
        updated_at: string;
      }>();

    // For each device, count alerts that use its push token and belong to the authenticated user
    const devices: Device[] = await Promise.all(
      (rows.results || []).map(async (row) => {
        // Count total alerts for this push token and user
        const totalAlertsResult = await env.stockly
          .prepare(`SELECT COUNT(*) as count FROM alerts WHERE target = ? AND user_id = ?`)
          .bind(row.push_token, userId)
          .first<{ count: number }>();

        // Count active alerts for this push token and user
        const activeAlertsResult = await env.stockly
          .prepare(`SELECT COUNT(*) as count FROM alerts WHERE target = ? AND user_id = ? AND status = 'active'`)
          .bind(row.push_token, userId)
          .first<{ count: number }>();

        return {
          userId: row.user_id,
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
    logger.error("Failed to get devices", { error, userId });
    return json({ error: "Failed to get devices" }, 500, request);
  }
}

/**
 * Delete a device
 * DELETE /v1/api/devices
 * userId from JWT authentication
 */
export async function deleteDevice(
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
    // Check if device exists
    const device = await env.stockly
      .prepare(
        `SELECT user_id FROM user_push_tokens WHERE user_id = ?`
      )
      .bind(userId)
      .first<{ user_id: string }>();

    if (!device) {
      return json({ error: "Device not found" }, 404, request);
    }

    // Delete the device
    await env.stockly
      .prepare(`DELETE FROM user_push_tokens WHERE user_id = ?`)
      .bind(userId)
      .run();

    logger.info("Device deleted successfully", { userId });
    return json({
      success: true,
      message: "Device deleted successfully",
      userId,
    }, 200, request);
  } catch (error) {
    logger.error("Failed to delete device", { error, userId });
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
 * Send a test notification to a device
 * POST /v1/api/devices/test
 * userId from JWT authentication
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
    // Get the device's push token
    const device = await env.stockly
      .prepare(
        `SELECT user_id, push_token, device_info 
         FROM user_push_tokens 
         WHERE user_id = ?`
      )
      .bind(userId)
      .first<{
        user_id: string;
        push_token: string;
        device_info: string | null;
      }>();

    if (!device) {
      return json({ error: "Device not found" }, 404, request);
    }

    // Parse optional custom message from request body
    let body: { message?: string } = {};
    try {
      const requestBody = await request.text();
      if (requestBody) {
        body = JSON.parse(requestBody);
      }
    } catch {
      // Use default message if body parsing fails
    }

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
    logger.error("Failed to send test notification", { error, userId });
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

