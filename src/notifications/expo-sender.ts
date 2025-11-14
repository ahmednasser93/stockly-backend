/**
 * Expo Push Notification Sender
 * 
 * Sends push notifications to mobile devices via Expo's push notification service.
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string; // Expo Push Token
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

export interface ExpoPushResponse {
  data: Array<{
    status: "ok" | "error";
    id?: string;
    message?: string;
    details?: unknown;
  }>;
}

/**
 * Error classification for Expo push notification errors
 */
export type ExpoPushErrorType =
  | "DEVICE_NOT_REGISTERED"  // Token is invalid/expired - permanent failure
  | "INVALID_TOKEN"          // Token format is wrong - permanent failure
  | "MESSAGE_TOO_BIG"        // Payload exceeds size limit - permanent failure
  | "MESSAGE_RATE_EXCEEDED"   // Rate limited - temporary, retry later
  | "NETWORK_ERROR"          // Network issues - temporary, retry
  | "UNKNOWN_ERROR";         // Unknown error - investigate

export interface ExpoPushErrorInfo {
  type: ExpoPushErrorType;
  message: string;
  isPermanent: boolean; // If true, don't retry
  shouldCleanupToken: boolean; // If true, remove token from database
}

/**
 * Classify Expo push notification errors
 */
function classifyExpoError(
  errorMessage: string,
  httpStatus?: number
): ExpoPushErrorInfo {
  const message = errorMessage.toLowerCase();

  // Permanent errors - don't retry
  if (message.includes("devicenotregistered") || message.includes("device not registered")) {
    return {
      type: "DEVICE_NOT_REGISTERED",
      message: errorMessage,
      isPermanent: true,
      shouldCleanupToken: true,
    };
  }

  if (message.includes("invalid token") || message.includes("invalid push token")) {
    return {
      type: "INVALID_TOKEN",
      message: errorMessage,
      isPermanent: true,
      shouldCleanupToken: true,
    };
  }

  if (message.includes("message too big") || message.includes("payload too large")) {
    return {
      type: "MESSAGE_TOO_BIG",
      message: errorMessage,
      isPermanent: true,
      shouldCleanupToken: false,
    };
  }

  // Temporary errors - can retry
  if (message.includes("rate limit") || message.includes("too many requests") || httpStatus === 429) {
    return {
      type: "MESSAGE_RATE_EXCEEDED",
      message: errorMessage,
      isPermanent: false,
      shouldCleanupToken: false,
    };
  }

  if (message.includes("network") || message.includes("timeout") || message.includes("connection")) {
    return {
      type: "NETWORK_ERROR",
      message: errorMessage,
      isPermanent: false,
      shouldCleanupToken: false,
    };
  }

  // Unknown error
  return {
    type: "UNKNOWN_ERROR",
    message: errorMessage,
    isPermanent: false,
    shouldCleanupToken: false,
  };
}

/**
 * Sleep helper for retry delays
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a single push notification with retry logic
 */
async function sendExpoPushInternal(
  message: ExpoPushMessage,
  attempt: number = 1
): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  try {
    const response = await fetch(EXPO_PUSH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result: ExpoPushResponse = await response.json();
    const ticket = result.data?.[0];

    if (!ticket) {
      return {
        success: false,
        error: "No ticket returned from Expo Push API",
      };
    }

    if (ticket.status === "error") {
      return {
        success: false,
        error: ticket.message || "Unknown error from Expo Push API",
      };
    }

    return {
      success: true,
      ticketId: ticket.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Send a push notification via Expo Push API with retry logic
 * Retries up to 3 times with exponential backoff: 200ms, 500ms, 1000ms
 */
export async function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  // Validate push token format
  if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
    console.error("Invalid Expo push token format:", pushToken);
    return false;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    title,
    body,
    sound: "default",
    priority: "high",
    data: data || {},
  };

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [200, 500, 1000]; // Exponential backoff in ms

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await sendExpoPushInternal(message, attempt);

    if (result.success) {
      console.log(
        `✅ Expo Push notification sent successfully (attempt ${attempt}/${MAX_RETRIES}):`,
        result.ticketId
      );
      return true;
    }

    // Log failure
    console.error(
      `❌ Expo Push notification failed (attempt ${attempt}/${MAX_RETRIES}):`,
      result.error
    );

    // If this was the last attempt, give up
    if (attempt === MAX_RETRIES) {
      console.error(
        `🚫 Expo Push notification failed after ${MAX_RETRIES} attempts. Giving up.`
      );
      return false;
    }

    // Wait before retrying (exponential backoff)
    const delay = RETRY_DELAYS[attempt - 1];
    console.log(`⏳ Retrying in ${delay}ms...`);
    await sleep(delay);
  }

  return false;
}

/**
 * Send a push notification with detailed logging
 * Returns success status and detailed logs of all attempts
 */
export async function sendExpoPushWithLogs(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ 
  success: boolean; 
  logs: string[]; 
  finalError?: string;
  errorType?: ExpoPushErrorType;
  shouldCleanupToken?: boolean;
}> {
  const logs: string[] = [];
  const startTime = Date.now();

  // Validate push token format
  if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
    const error = "Invalid Expo push token format";
    const errorInfo = classifyExpoError(error);
    logs.push(`[${new Date().toISOString()}] ❌ Validation failed: ${error}`);
    logs.push(`Token received: ${pushToken ? pushToken.substring(0, 50) + "..." : "null/undefined"}`);
    logs.push(`  Error Type: ${errorInfo.type}`);
    logs.push(`  Should Cleanup Token: ${errorInfo.shouldCleanupToken ? "Yes" : "No"}`);
    return { 
      success: false, 
      logs, 
      finalError: error,
      errorType: errorInfo.type,
      shouldCleanupToken: errorInfo.shouldCleanupToken,
    };
  }

  logs.push(`[${new Date().toISOString()}] ✅ Push token format validated`);
  logs.push(`Token: ${pushToken.substring(0, 30)}...`);

  const message: ExpoPushMessage = {
    to: pushToken,
    title,
    body,
    sound: "default",
    priority: "high",
    data: data || {},
  };

  logs.push(`[${new Date().toISOString()}] 📤 Preparing notification:`);
  logs.push(`  Title: ${title}`);
  logs.push(`  Body: ${body}`);
  logs.push(`  Data: ${JSON.stringify(data || {})}`);

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [200, 500, 1000]; // Exponential backoff in ms

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const attemptStartTime = Date.now();
    logs.push(`[${new Date().toISOString()}] 🔄 Attempt ${attempt}/${MAX_RETRIES} starting...`);

    try {
      const fetchStartTime = Date.now();
      const response = await fetch(EXPO_PUSH_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(message),
      });

      const fetchDuration = Date.now() - fetchStartTime;
      logs.push(`[${new Date().toISOString()}] 📡 HTTP Response received in ${fetchDuration}ms`);
      logs.push(`  Status: ${response.status} ${response.statusText}`);
      logs.push(`  Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Could not read error response");
        const errorInfo = classifyExpoError(`HTTP ${response.status}: ${response.statusText}`, response.status);
        
        logs.push(`[${new Date().toISOString()}] ❌ HTTP Error Response:`);
        logs.push(`  Status: ${response.status} ${response.statusText}`);
        logs.push(`  Body: ${errorText.substring(0, 500)}`);
        logs.push(`  Error Type: ${errorInfo.type}`);
        logs.push(`  Is Permanent: ${errorInfo.isPermanent ? "Yes (don't retry)" : "No (can retry)"}`);

        // If permanent error, don't retry
        if (errorInfo.isPermanent) {
          const totalDuration = Date.now() - startTime;
          logs.push(`[${new Date().toISOString()}] 🚫 Permanent HTTP error - stopping retries after ${totalDuration}ms`);
          return {
            success: false,
            logs,
            finalError: `HTTP ${response.status}: ${response.statusText}`,
            errorType: errorInfo.type,
            shouldCleanupToken: errorInfo.shouldCleanupToken,
          };
        }

        // If this was the last attempt, return failure
        if (attempt === MAX_RETRIES) {
          const totalDuration = Date.now() - startTime;
          logs.push(`[${new Date().toISOString()}] 🚫 All ${MAX_RETRIES} attempts failed after ${totalDuration}ms`);
          return {
            success: false,
            logs,
            finalError: `HTTP ${response.status}: ${response.statusText}`,
            errorType: errorInfo.type,
            shouldCleanupToken: errorInfo.shouldCleanupToken,
          };
        }

        // Wait before retrying
        const delay = RETRY_DELAYS[attempt - 1];
        logs.push(`[${new Date().toISOString()}] ⏳ Waiting ${delay}ms before retry...`);
        await sleep(delay);
        continue;
      }

      // Parse response
      const parseStartTime = Date.now();
      let result: ExpoPushResponse;
      try {
        result = await response.json();
        const parseDuration = Date.now() - parseStartTime;
        logs.push(`[${new Date().toISOString()}] 📦 Response parsed in ${parseDuration}ms`);
        logs.push(`  Full response: ${JSON.stringify(result, null, 2)}`);
      } catch (parseError) {
        const error = parseError instanceof Error ? parseError.message : String(parseError);
        logs.push(`[${new Date().toISOString()}] ❌ Failed to parse JSON response: ${error}`);
        
        if (attempt === MAX_RETRIES) {
          const totalDuration = Date.now() - startTime;
          logs.push(`[${new Date().toISOString()}] 🚫 All ${MAX_RETRIES} attempts failed after ${totalDuration}ms`);
          return {
            success: false,
            logs,
            finalError: `Failed to parse response: ${error}`,
          };
        }

        const delay = RETRY_DELAYS[attempt - 1];
        logs.push(`[${new Date().toISOString()}] ⏳ Waiting ${delay}ms before retry...`);
        await sleep(delay);
        continue;
      }

      const ticket = result.data?.[0];
      const attemptDuration = Date.now() - attemptStartTime;

      if (!ticket) {
        logs.push(`[${new Date().toISOString()}] ❌ No ticket in response data`);
        logs.push(`  Response data: ${JSON.stringify(result.data)}`);

        if (attempt === MAX_RETRIES) {
          const totalDuration = Date.now() - startTime;
          logs.push(`[${new Date().toISOString()}] 🚫 All ${MAX_RETRIES} attempts failed after ${totalDuration}ms`);
          return {
            success: false,
            logs,
            finalError: "No ticket returned from Expo Push API",
          };
        }

        const delay = RETRY_DELAYS[attempt - 1];
        logs.push(`[${new Date().toISOString()}] ⏳ Waiting ${delay}ms before retry...`);
        await sleep(delay);
        continue;
      }

      logs.push(`[${new Date().toISOString()}] 🎫 Ticket received:`);
      logs.push(`  Status: ${ticket.status}`);
      logs.push(`  ID: ${ticket.id || "N/A"}`);
      logs.push(`  Message: ${ticket.message || "N/A"}`);
      if (ticket.details) {
        logs.push(`  Details: ${JSON.stringify(ticket.details)}`);
      }

      if (ticket.status === "error") {
        const errorMsg = ticket.message || "Unknown error from Expo Push API";
        const errorInfo = classifyExpoError(errorMsg, response.status);
        
        logs.push(`[${new Date().toISOString()}] ❌ Expo API returned error: ${errorMsg}`);
        logs.push(`  Error Type: ${errorInfo.type}`);
        logs.push(`  Is Permanent: ${errorInfo.isPermanent ? "Yes (don't retry)" : "No (can retry)"}`);
        logs.push(`  Should Cleanup Token: ${errorInfo.shouldCleanupToken ? "Yes" : "No"}`);
        
        // If permanent error, don't retry
        if (errorInfo.isPermanent) {
          const totalDuration = Date.now() - startTime;
          logs.push(`[${new Date().toISOString()}] 🚫 Permanent error detected - stopping retries after ${totalDuration}ms`);
          logs.push(`  Recommendation: ${errorInfo.shouldCleanupToken ? "Remove invalid token from database" : "Fix payload and try again"}`);
          return {
            success: false,
            logs,
            finalError: errorMsg,
            errorType: errorInfo.type,
            shouldCleanupToken: errorInfo.shouldCleanupToken,
          };
        }

        // If this was the last attempt, return failure
        if (attempt === MAX_RETRIES) {
          const totalDuration = Date.now() - startTime;
          logs.push(`[${new Date().toISOString()}] 🚫 All ${MAX_RETRIES} attempts failed after ${totalDuration}ms`);
          return {
            success: false,
            logs,
            finalError: errorMsg,
            errorType: errorInfo.type,
            shouldCleanupToken: errorInfo.shouldCleanupToken,
          };
        }

        const delay = RETRY_DELAYS[attempt - 1];
        logs.push(`[${new Date().toISOString()}] ⏳ Waiting ${delay}ms before retry...`);
        await sleep(delay);
        continue;
      }

      // Success!
      const totalDuration = Date.now() - startTime;
      logs.push(`[${new Date().toISOString()}] ✅ SUCCESS on attempt ${attempt}/${MAX_RETRIES}`);
      logs.push(`  Ticket ID: ${ticket.id}`);
      logs.push(`  Total time: ${totalDuration}ms`);
      logs.push(`  Attempt duration: ${attemptDuration}ms`);

      return {
        success: true,
        logs,
      };
    } catch (error) {
      const attemptDuration = Date.now() - attemptStartTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logs.push(`[${new Date().toISOString()}] ❌ Exception on attempt ${attempt}/${MAX_RETRIES}:`);
      logs.push(`  Error: ${errorMsg}`);
      if (errorStack) {
        logs.push(`  Stack: ${errorStack.substring(0, 500)}`);
      }
      logs.push(`  Attempt duration: ${attemptDuration}ms`);

      if (attempt === MAX_RETRIES) {
        const totalDuration = Date.now() - startTime;
        logs.push(`[${new Date().toISOString()}] 🚫 All ${MAX_RETRIES} attempts failed after ${totalDuration}ms`);
        return {
          success: false,
          logs,
          finalError: errorMsg,
        };
      }

      const delay = RETRY_DELAYS[attempt - 1];
      logs.push(`[${new Date().toISOString()}] ⏳ Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }

  const totalDuration = Date.now() - startTime;
  logs.push(`[${new Date().toISOString()}] 🚫 All ${MAX_RETRIES} attempts exhausted after ${totalDuration}ms`);
  return {
    success: false,
    logs,
    finalError: "Failed after all retry attempts",
    errorType: "UNKNOWN_ERROR",
    shouldCleanupToken: false,
  };
}

/**
 * Send push notifications to multiple devices
 */
export async function sendExpoPushBatch(
  messages: Array<{ pushToken: string; title: string; body: string; data?: Record<string, unknown> }>
): Promise<{ success: number; failed: number }> {
  const results = await Promise.allSettled(
    messages.map((msg) => sendExpoPush(msg.pushToken, msg.title, msg.body, msg.data))
  );

  const success = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
  const failed = results.length - success;

  return { success, failed };
}

