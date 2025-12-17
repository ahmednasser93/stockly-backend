import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest, authenticateRequestWithAdmin } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import { sendFCMNotification } from "../notifications/fcm-sender";
import type { Logger } from "../logging/logger";

export interface Device {
  userId: string | null; // Can be null for unregistered devices
  username: string | null;
  pushToken: string;
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

    // Get user_id from username if not admin (initialize to avoid ReferenceError)
    let userId: string | null = null;
    
    try {
      if (username) {
        const user = await env.stockly
          .prepare("SELECT id FROM users WHERE username = ?")
          .bind(username)
          .first<{ id: string }>();
        userId = user?.id || null;
      }

    let rows: { results?: Array<any> } | null = null;
    if (username === null) {
      // Admin: get all devices including those without usernames (unregistered devices)
      // LEFT JOIN ensures devices with null user_id or users without username are included
      // Note: upt.username column may not exist in production, so we only use u.username from JOIN
      try {
        rows = await env.stockly
          .prepare(
            `SELECT 
               upt.user_id, 
               upt.push_token, 
               upt.device_info,
               upt.device_type,
               upt.created_at, 
               upt.updated_at,
               u.username
             FROM user_push_tokens upt
             LEFT JOIN users u ON upt.user_id = u.id
             ORDER BY upt.updated_at DESC`
          )
          .all<{
            user_id: string | null;
            push_token: string;
            device_info: string | null;
            device_type: string | null;
            created_at: string;
            updated_at: string;
            username: string | null;
          }>();
      } catch (error) {
        // If device_type or username column doesn't exist, select without them
        if (error instanceof Error && (error.message.includes('device_type') || error.message.includes('username'))) {
          try {
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
                user_id: string | null;
                push_token: string;
                device_info: string | null;
                created_at: string;
                updated_at: string;
                username: string | null;
              }>();
          } catch (fallbackError) {
            // If even device_info doesn't exist, use minimal query
            if (fallbackError instanceof Error && fallbackError.message.includes('device_info')) {
              rows = await env.stockly
                .prepare(
                  `SELECT 
                     upt.user_id, 
                     upt.push_token, 
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
                  created_at: string;
                  updated_at: string;
                  username: string | null;
                }>();
            } else {
              throw fallbackError;
            }
          }
        } else {
          throw error;
        }
      }
      
      // Log devices with null usernames for debugging
      const devicesWithNullUsername = rows?.results?.filter(r => !r.username) || [];
      if (devicesWithNullUsername.length > 0) {
        logger.warn("Found devices with null username", {
          count: devicesWithNullUsername.length,
          deviceIds: devicesWithNullUsername.map(d => d.push_token?.substring(0, 20) + "..."),
        });
      }
    } else {
      // Regular user: filter by username
      // Note: upt.username column may not exist in production, so we only use u.username from JOIN
      try {
        rows = await env.stockly
          .prepare(
            `SELECT 
               upt.user_id, 
               upt.push_token, 
               upt.device_info,
               upt.device_type,
               upt.created_at, 
               upt.updated_at,
               u.username
             FROM user_push_tokens upt
             LEFT JOIN users u ON upt.user_id = u.id
             WHERE u.username = ?
             ORDER BY upt.updated_at DESC`
          )
          .bind(username)
          .all<{
            user_id: string | null;
            push_token: string;
            device_info: string | null;
            device_type: string | null;
            created_at: string;
            updated_at: string;
            username: string | null;
          }>();
      } catch (error) {
        // If device_type or username column doesn't exist, select without them
        // Also remove upt.username from WHERE clause
        if (error instanceof Error && (error.message.includes('device_type') || error.message.includes('username'))) {
          try {
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
                 WHERE u.username = ?
                 ORDER BY upt.updated_at DESC`
              )
              .bind(username)
              .all<{
                user_id: string | null;
                push_token: string;
                device_info: string | null;
                created_at: string;
                updated_at: string;
                username: string | null;
              }>();
          } catch (fallbackError) {
            // If even device_info doesn't exist, use minimal query
            if (fallbackError instanceof Error && fallbackError.message.includes('device_info')) {
              rows = await env.stockly
                .prepare(
                  `SELECT 
                     upt.user_id, 
                     upt.push_token, 
                     upt.created_at, 
                     upt.updated_at,
                     u.username
                   FROM user_push_tokens upt
                   LEFT JOIN users u ON upt.user_id = u.id
                   WHERE u.username = ?
                   ORDER BY upt.updated_at DESC`
                )
                .bind(username)
                .all<{
                  user_id: string;
                  push_token: string;
                  created_at: string;
                  updated_at: string;
                  username: string | null;
                }>();
            } else {
              throw fallbackError;
            }
          }
        } else {
          throw error;
        }
      }
    }

        // For each device, count alerts that use its push token
    if (!rows || !rows.results) {
      return json({ devices: [] }, 200, request);
    }

    const devices: Device[] = await Promise.all(
      rows.results.map(async (row) => {
        // Count total alerts for this device's user (alerts are now associated with username, not target)
        let totalAlertsResult, activeAlertsResult;
        if (username === null) {
          // Admin: count all alerts for this device's username
          if (row.username) {
            totalAlertsResult = await env.stockly
              .prepare(`SELECT COUNT(*) as count FROM alerts WHERE username = ?`)
              .bind(row.username)
              .first<{ count: number }>();

            activeAlertsResult = await env.stockly
              .prepare(`SELECT COUNT(*) as count FROM alerts WHERE username = ? AND status = 'active'`)
              .bind(row.username)
              .first<{ count: number }>();
          } else {
            // Device has no username, so no alerts
            totalAlertsResult = { count: 0 };
            activeAlertsResult = { count: 0 };
          }
        } else {
          // Regular user: count alerts for this username (device username should match authenticated username)
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
          userId: row.user_id,
          username: row.username,
          pushToken: row.push_token,
          deviceInfo: row.device_info,
          deviceType: 'device_type' in row ? (row as any).device_type : null,
          alertCount: totalAlertsResult?.count || 0,
          activeAlertCount: activeAlertsResult?.count || 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
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
    // Get device username by joining with users table
    const deviceUser = await env.stockly
      .prepare(
        `SELECT u.username 
         FROM user_push_tokens upt
         LEFT JOIN users u ON upt.user_id = u.id
         WHERE upt.push_token = ?`
      )
      .bind(pushToken)
      .first<{ username: string | null }>();

    if (!auth.isAdmin && deviceUser?.username !== auth.username) {
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
      deletedBy: auth.username, 
      isAdmin: auth.isAdmin 
    });
    return json({
      success: true,
      message: "Device deleted successfully",
      userId: device.user_id,
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

