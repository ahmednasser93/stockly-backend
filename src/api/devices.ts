import { json } from "../util";
import type { Env } from "../index";
import { sendFCMNotification } from "../notifications/fcm-sender";

export interface Device {
  userId: string;
  pushToken: string;
  deviceInfo: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all registered devices
 * GET /v1/api/devices
 */
export async function getAllDevices(env: Env): Promise<Response> {
  try {
    const rows = await env.stockly
      .prepare(
        `SELECT user_id, push_token, device_info, created_at, updated_at 
         FROM user_push_tokens 
         ORDER BY updated_at DESC`
      )
      .all<{
        user_id: string;
        push_token: string;
        device_info: string | null;
        created_at: string;
        updated_at: string;
      }>();

    const devices: Device[] = (rows.results || []).map((row) => ({
      userId: row.user_id,
      pushToken: row.push_token,
      deviceInfo: row.device_info,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return json({ devices });
  } catch (error) {
    console.error("Failed to get devices:", error);
    return json({ error: "Failed to get devices" }, 500);
  }
}

/**
 * Delete a device
 * DELETE /v1/api/devices/:userId
 */
export async function deleteDevice(
  userId: string,
  env: Env
): Promise<Response> {
  if (!userId) {
    return json({ error: "userId is required" }, 400);
  }

  try {
    // Check if device exists
    const device = await env.stockly
      .prepare(
        `SELECT user_id FROM user_push_tokens WHERE user_id = ?`
      )
      .bind(userId)
      .first<{ user_id: string }>();

    if (!device) {
      return json({ error: "Device not found" }, 404);
    }

    // Delete the device
    await env.stockly
      .prepare(`DELETE FROM user_push_tokens WHERE user_id = ?`)
      .bind(userId)
      .run();

    return json({
      success: true,
      message: "Device deleted successfully",
      userId,
    });
  } catch (error) {
    console.error("Failed to delete device:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return json(
      {
        success: false,
        error: `Failed to delete device: ${errorMessage}`,
      },
      500
    );
  }
}

/**
 * Send a test notification to a device
 * POST /v1/api/devices/:userId/test
 */
export async function sendTestNotification(
  userId: string,
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!userId) {
    return json({ error: "userId is required" }, 400);
  }

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
      return json({ error: "Device not found" }, 404);
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
      env
    );

    if (success) {
      return json({
        success: true,
        message: "Test notification sent successfully",
        userId: device.user_id,
      });
    } else {
      return json(
        {
          success: false,
          error: "Failed to send test notification",
          userId: device.user_id,
        },
        500
      );
    }
  } catch (error) {
    console.error("Failed to send test notification:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return json(
      {
        success: false,
        error: `Failed to send test notification: ${errorMessage}`,
      },
      500
    );
  }
}

