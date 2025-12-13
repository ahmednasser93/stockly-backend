import { json } from "../util";
import type { Env } from "../index";
import { sendFCMNotificationWithLogs } from "../notifications/fcm-sender";
import { authenticateRequestWithAdmin } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";

export interface NotificationLog {
  id: string;
  alertId: string;
  symbol: string;
  threshold: number;
  price: number;
  direction: string;
  pushToken: string;
  status: string;
  errorMessage?: string | null;
  attemptCount: number;
  sentAt: string;
}

/**
 * Get recent notification logs (last 100 notifications)
 * Admin only - returns all notifications
 */
import type { Logger } from "../logging/logger";

export async function getRecentNotifications(request: Request, env: Env, logger: Logger): Promise<Response> {
  // Authenticate and check admin status
  const auth = await authenticateRequestWithAdmin(
    request,
    env,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth || !auth.isAdmin) {
    const { response } = createErrorResponse(
      "AUTH_FORBIDDEN",
      "Admin access required",
      undefined,
      undefined,
      request
    );
    return response;
  }
  try {
    const results = await env.stockly
      .prepare(
        `SELECT id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, attempt_count, sent_at
         FROM notifications_log
         ORDER BY sent_at DESC
         LIMIT 100`
      )
      .all<{
        id: string;
        alert_id: string;
        symbol: string;
        threshold: number;
        price: number;
        direction: string;
        push_token: string;
        status: string;
        error_message: string | null;
        attempt_count: number;
        sent_at: string;
      }>();

    const notifications: NotificationLog[] = (results.results || []).map((row) => ({
      id: row.id,
      alertId: row.alert_id,
      symbol: row.symbol,
      threshold: row.threshold,
      price: row.price,
      direction: row.direction,
      pushToken: row.push_token,
      status: row.status,
      errorMessage: row.error_message,
      attemptCount: row.attempt_count,
      sentAt: row.sent_at,
    }));

    return json({ notifications }, 200, request);
  } catch (error) {
    console.error("Failed to retrieve recent notifications:", error);
    return json({ error: "Failed to retrieve recent notifications" }, 500, request);
  }
}

/**
 * Get failed notification logs
 */
export async function getFailedNotifications(env: Env, logger: Logger): Promise<Response> {
  try {
    const results = await env.stockly
      .prepare(
        `SELECT id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, attempt_count, sent_at
         FROM notifications_log
         WHERE status IN ('failed', 'error')
         ORDER BY sent_at DESC
         LIMIT 100`
      )
      .all<{
        id: string;
        alert_id: string;
        symbol: string;
        threshold: number;
        price: number;
        direction: string;
        push_token: string;
        status: string;
        error_message: string | null;
        attempt_count: number;
        sent_at: string;
      }>();

    const notifications: NotificationLog[] = (results.results || []).map((row) => ({
      id: row.id,
      alertId: row.alert_id,
      symbol: row.symbol,
      threshold: row.threshold,
      price: row.price,
      direction: row.direction,
      pushToken: row.push_token,
      status: row.status,
      errorMessage: row.error_message,
      attemptCount: row.attempt_count,
      sentAt: row.sent_at,
    }));

    return json({ notifications }, 200, request);
  } catch (error) {
    console.error("Failed to retrieve failed notifications:", error);
    return json({ error: "Failed to retrieve failed notifications" }, 500, request);
  }
}

/**
 * Get notification logs with filters
 * Admin only - returns all filtered notifications
 */
export async function getFilteredNotifications(
  request: Request,
  symbol?: string,
  status?: string,
  startDate?: string,
  endDate?: string,
  env?: Env
): Promise<Response> {
  if (!env) {
    return json({ error: "Environment not provided" }, 500, request);
  }

  // Authenticate and check admin status
  const auth = await authenticateRequestWithAdmin(
    request,
    env,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth || !auth.isAdmin) {
    const { response } = createErrorResponse(
      "AUTH_FORBIDDEN",
      "Admin access required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  try {
    let query = `SELECT id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, attempt_count, sent_at
                 FROM notifications_log
                 WHERE 1=1`;
    const bindings: (string | number)[] = [];

    if (symbol) {
      query += ` AND symbol = ?`;
      bindings.push(symbol);
    }

    if (status) {
      query += ` AND status = ?`;
      bindings.push(status);
    }

    if (startDate) {
      query += ` AND sent_at >= ?`;
      bindings.push(startDate);
    }

    if (endDate) {
      query += ` AND sent_at <= ?`;
      bindings.push(endDate);
    }

    query += ` ORDER BY sent_at DESC LIMIT 200`;

    const stmt = env.stockly.prepare(query);
    const results = await stmt.bind(...bindings).all<{
      id: string;
      alert_id: string;
      symbol: string;
      threshold: number;
      price: number;
      direction: string;
      push_token: string;
      status: string;
      error_message: string | null;
      attempt_count: number;
      sent_at: string;
    }>();

    const notifications: NotificationLog[] = (results.results || []).map((row) => ({
      id: row.id,
      alertId: row.alert_id,
      symbol: row.symbol,
      threshold: row.threshold,
      price: row.price,
      direction: row.direction,
      pushToken: row.push_token,
      status: row.status,
      errorMessage: row.error_message,
      attemptCount: row.attempt_count,
      sentAt: row.sent_at,
    }));

    return json({ notifications }, 200, request);
  } catch (error) {
    console.error("Failed to retrieve filtered notifications:", error);
    return json({ error: "Failed to retrieve filtered notifications" }, 500, request);
  }
}

/**
 * Retry sending a failed notification
 * POST /v1/api/notifications/retry/:logId
 * Admin only - can retry any notification
 */
export async function retryNotification(request: Request, logId: string, env: Env, logger: Logger): Promise<Response> {
  // Authenticate and check admin status
  const auth = await authenticateRequestWithAdmin(
    request,
    env,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth || !auth.isAdmin) {
    const { response } = createErrorResponse(
      "AUTH_FORBIDDEN",
      "Admin access required",
      undefined,
      undefined,
      request
    );
    return response;
  }
  try {
    // Get the notification log entry
    const logResult = await env.stockly
      .prepare(
        `SELECT id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, attempt_count, sent_at
         FROM notifications_log
         WHERE id = ?`
      )
      .bind(logId)
      .first<{
        id: string;
        alert_id: string;
        symbol: string;
        threshold: number;
        price: number;
        direction: string;
        push_token: string;
        status: string;
        error_message: string | null;
        attempt_count: number;
        sent_at: string;
      }>();

    if (!logResult) {
      return json({ error: "Notification log not found" }, 404, request);
    }

    const { symbol, threshold, price, direction, push_token } = logResult;

    // Prepare notification message
    const title = `${symbol} Alert`;
    const body = 
      direction === "above"
        ? `${symbol} is now $${price.toFixed(2)} (above your target of $${threshold.toFixed(2)})`
        : `${symbol} is now $${price.toFixed(2)} (below your target of $${threshold.toFixed(2)})`;
    
    const pushData = {
      alertId: logResult.alert_id,
      symbol: symbol,
      price: price,
      threshold: threshold,
      direction: direction,
    };

    // Attempt to send the notification with detailed logging
    const retryLogs: string[] = [];
    retryLogs.push(`[${new Date().toISOString()}] 🔄 Starting retry for notification ${logId}`);
    retryLogs.push(`📊 Alert Details:`);
    retryLogs.push(`  Symbol: ${symbol}`);
    retryLogs.push(`  Price: $${price.toFixed(2)}`);
    retryLogs.push(`  Threshold: $${threshold.toFixed(2)}`);
    retryLogs.push(`  Direction: ${direction}`);
    retryLogs.push(`  Push Token: ${push_token.substring(0, 30)}...`);
    retryLogs.push(`  Original Error: ${logResult.error_message || "None"}`);
    retryLogs.push(`  Original Status: ${logResult.status}`);
    retryLogs.push(`  Original Attempt Count: ${logResult.attempt_count}`);
    retryLogs.push(``);

    let success = false;
    let errorMessage: string | null = null;

    try {
      const result = await sendFCMNotificationWithLogs(push_token, title, body, pushData, env);
      
      // Add all detailed logs from the send function
      retryLogs.push(...result.logs);
      
      success = result.success;
      errorMessage = result.finalError || null;
      
      if (success) {
        retryLogs.push(``);
        retryLogs.push(`[${new Date().toISOString()}] ✅✅ RETRY SUCCESSFUL ✅✅`);
        if (result.messageId) {
          retryLogs.push(`FCM Message ID: ${result.messageId}`);
        }
      } else {
        retryLogs.push(``);
        retryLogs.push(`[${new Date().toISOString()}] ❌❌ RETRY FAILED ❌❌`);
        retryLogs.push(`Final Error: ${errorMessage || "Unknown error"}`);
        if (result.errorType) {
          retryLogs.push(`Error Type: ${result.errorType}`);
          retryLogs.push(`Is Permanent: ${result.errorType === "NOT_FOUND" || result.errorType === "INVALID_ARGUMENT" ? "Yes" : "No"}`);
          if (result.shouldCleanupToken) {
            retryLogs.push(`⚠️  RECOMMENDATION: This token is invalid and should be removed from the database`);
            retryLogs.push(`   The user needs to re-register their FCM token in the mobile app`);
          }
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      retryLogs.push(`[${new Date().toISOString()}] ❌❌ EXCEPTION DURING RETRY ❌❌`);
      retryLogs.push(`Error: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        retryLogs.push(`Stack: ${error.stack.substring(0, 1000)}`);
      }
    }

    // Log the retry result to the database
    const newLogId = `${logResult.alert_id}_retry_${Date.now()}`;
    const now = new Date().toISOString();
    const newStatus = success ? "success" : "failed";
    
    await env.stockly
      .prepare(
        `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, attempt_count, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newLogId,
        logResult.alert_id,
        symbol,
        threshold,
        price,
        direction,
        push_token,
        newStatus,
        errorMessage,
        1,
        now
      )
      .run();

    retryLogs.push(`[${new Date().toISOString()}] 📝 Logged result to database with ID: ${newLogId}`);

    return json({
      success,
      logId: newLogId,
      status: newStatus,
      errorMessage,
      logs: retryLogs,
    }, 200, request);
  } catch (error) {
    console.error("Failed to retry notification:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return json({ 
      success: false,
      error: "Failed to retry notification",
      errorMessage,
      logs: [`[${new Date().toISOString()}] ❌ Error: ${errorMessage}`],
    }, 500, request);
  }
}

