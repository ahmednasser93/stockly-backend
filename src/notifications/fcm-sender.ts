/**
 * Firebase Cloud Messaging (FCM) HTTP v1 API Sender
 * 
 * Sends push notifications via FCM HTTP v1 API
 * Docs: https://firebase.google.com/docs/cloud-messaging/migrate-v1
 */

import type { Env } from "../index";
import type { Logger } from "../logging/logger";

const FCM_API_BASE = "https://fcm.googleapis.com/v1/projects";

export interface FCMMessage {
  token: string; // FCM token
  notification?: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
  android?: {
    priority: "normal" | "high";
    notification?: {
      sound?: string;
      channelId?: string;
    };
  };
  apns?: {
    headers?: {
      "apns-priority": string;
    };
    payload?: {
      aps: {
        sound?: string;
        badge?: number;
      };
    };
  };
}

export interface FCMResponse {
  name: string;
}

export interface FCMError {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      "@type": string;
      [key: string]: unknown;
    }>;
  };
}

/**
 * Error classification for FCM errors
 */
export type FCMErrorType =
  | "INVALID_ARGUMENT"        // Invalid token format - permanent
  | "NOT_FOUND"              // Token not registered - permanent
  | "PERMISSION_DENIED"      // Service account issue - permanent
  | "UNAUTHENTICATED"        // Auth token issue - temporary
  | "RESOURCE_EXHAUSTED"     // Rate limited - temporary
  | "UNAVAILABLE"            // Service unavailable - temporary
  | "DEADLINE_EXCEEDED"      // Timeout - temporary
  | "NETWORK_ERROR"          // Network issues - temporary
  | "UNKNOWN_ERROR";         // Unknown error

export interface FCMErrorInfo {
  type: FCMErrorType;
  message: string;
  isPermanent: boolean;
  shouldCleanupToken: boolean;
}

/**
 * Classify FCM errors
 */
function classifyFCMError(error: FCMError): FCMErrorInfo {
  const status = error.error.status || "";
  const message = error.error.message || "";
  const code = error.error.code || 0;

  // Permanent errors - don't retry
  if (status === "INVALID_ARGUMENT" || code === 3) {
    return {
      type: "INVALID_ARGUMENT",
      message: message,
      isPermanent: true,
      shouldCleanupToken: true,
    };
  }

  if (status === "NOT_FOUND" || code === 5 || message.includes("not found")) {
    return {
      type: "NOT_FOUND",
      message: message,
      isPermanent: true,
      shouldCleanupToken: true,
    };
  }

  if (status === "PERMISSION_DENIED" || code === 7) {
    return {
      type: "PERMISSION_DENIED",
      message: message,
      isPermanent: true,
      shouldCleanupToken: false,
    };
  }

  // Temporary errors - can retry
  if (status === "UNAUTHENTICATED" || code === 16) {
    return {
      type: "UNAUTHENTICATED",
      message: message,
      isPermanent: false,
      shouldCleanupToken: false,
    };
  }

  if (status === "RESOURCE_EXHAUSTED" || code === 8) {
    return {
      type: "RESOURCE_EXHAUSTED",
      message: message,
      isPermanent: false,
      shouldCleanupToken: false,
    };
  }

  if (status === "UNAVAILABLE" || code === 14) {
    return {
      type: "UNAVAILABLE",
      message: message,
      isPermanent: false,
      shouldCleanupToken: false,
    };
  }

  if (status === "DEADLINE_EXCEEDED" || code === 4) {
    return {
      type: "DEADLINE_EXCEEDED",
      message: message,
      isPermanent: false,
      shouldCleanupToken: false,
    };
  }

  if (message.includes("network") || message.includes("timeout") || message.includes("connection")) {
    return {
      type: "NETWORK_ERROR",
      message: message,
      isPermanent: false,
      shouldCleanupToken: false,
    };
  }

  return {
    type: "UNKNOWN_ERROR",
    message: message,
    isPermanent: false,
    shouldCleanupToken: false,
  };
}

import { generateGoogleJWT, getGoogleAccessTokenFromJWT } from "./jwt-helper";

/**
 * Generate Google Cloud JWT access token
 * Uses service account credentials from Cloudflare Secrets
 */
async function getGoogleAccessToken(env: Env): Promise<string> {
  try {
    // Get service account JSON from Cloudflare Secrets
    const serviceAccountJson = env.FCM_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error("FCM_SERVICE_ACCOUNT secret not configured");
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const { private_key, client_email, project_id } = serviceAccount;

    if (!private_key || !client_email || !project_id) {
      throw new Error("Invalid service account JSON structure");
    }

    // Generate JWT
    const jwt = await generateGoogleJWT(serviceAccount);

    // Exchange JWT for access token
    const accessToken = await getGoogleAccessTokenFromJWT(jwt);

    return accessToken;
  } catch (error) {
    console.error("Failed to get Google access token:", error);
    throw error;
  }
}

/**
 * Send FCM notification with detailed logging
 */
export async function sendFCMNotificationWithLogs(
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  env: Env,
  logger: Logger
): Promise<{
  success: boolean;
  logs: string[];
  finalError?: string;
  errorType?: FCMErrorType;
  shouldCleanupToken?: boolean;
  messageId?: string;
}> {
  const logs: string[] = [];
  const startTime = Date.now();

  // Validate FCM token format
  if (!fcmToken || typeof fcmToken !== "string" || fcmToken.length < 10) {
    const error = "Invalid FCM token format";
    logs.push(`[${new Date().toISOString()}] ❌ Validation failed: ${error}`);
    logs.push(`Token received: ${fcmToken ? fcmToken.substring(0, 50) + "..." : "null/undefined"}`);
    return {
      success: false,
      logs,
      finalError: error,
      errorType: "INVALID_ARGUMENT",
      shouldCleanupToken: true,
    };
  }

  logs.push(`[${new Date().toISOString()}] ✅ FCM token format validated`);
  logs.push(`Token: ${fcmToken.substring(0, 30)}...`);

  // Get project ID from service account
  let projectId: string;
  try {
    const serviceAccountJson = env.FCM_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error("FCM_SERVICE_ACCOUNT secret not configured");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    projectId = serviceAccount.project_id;
    if (!projectId) {
      throw new Error("project_id not found in service account");
    }
    logs.push(`[${new Date().toISOString()}] ✅ Project ID: ${projectId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logs.push(`[${new Date().toISOString()}] ❌ Failed to get project ID: ${errorMsg}`);
    return {
      success: false,
      logs,
      finalError: errorMsg,
      errorType: "PERMISSION_DENIED",
      shouldCleanupToken: false,
    };
  }

  // Get access token
  let accessToken: string;
  try {
    logs.push(`[${new Date().toISOString()}] 🔑 Requesting Google access token...`);
    const tokenStartTime = Date.now();
    accessToken = await getGoogleAccessToken(env);
    const tokenDuration = Date.now() - tokenStartTime;
    logs.push(`[${new Date().toISOString()}] ✅ Access token obtained in ${tokenDuration}ms`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logs.push(`[${new Date().toISOString()}] ❌ Failed to get access token: ${errorMsg}`);
    return {
      success: false,
      logs,
      finalError: errorMsg,
      errorType: "UNAUTHENTICATED",
      shouldCleanupToken: false,
    };
  }

  // Prepare FCM message
  const fcmMessage: FCMMessage = {
    token: fcmToken,
    notification: {
      title,
      body,
    },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: "high",
      notification: {
        sound: "default",
        channelId: "default",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  };

  logs.push(`[${new Date().toISOString()}] 📤 Preparing FCM message:`);
  logs.push(`  Title: ${title}`);
  logs.push(`  Body: ${body}`);
  logs.push(`  Data: ${JSON.stringify(data)}`);

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [200, 500, 1000];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const attemptStartTime = Date.now();
    logs.push(`[${new Date().toISOString()}] 🔄 Attempt ${attempt}/${MAX_RETRIES} starting...`);

    try {
      const fetchStartTime = Date.now();
      const fcmUrl = `${FCM_API_BASE}/${projectId}/messages:send`;

      const response = await fetch(fcmUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: fcmMessage,
        }),
      });

      const fetchDuration = Date.now() - fetchStartTime;
      logs.push(`[${new Date().toISOString()}] 📡 HTTP Response received in ${fetchDuration}ms`);
      logs.push(`  Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorData: FCMError = await response.json().catch(() => ({
          error: {
            code: response.status,
            message: response.statusText,
            status: "UNKNOWN",
          },
        }));

        const errorInfo = classifyFCMError(errorData);
        logs.push(`[${new Date().toISOString()}] ❌ FCM API Error:`);
        logs.push(`  Status: ${errorData.error.status}`);
        logs.push(`  Code: ${errorData.error.code}`);
        logs.push(`  Message: ${errorData.error.message}`);
        logs.push(`  Error Type: ${errorInfo.type}`);
        logs.push(`  Is Permanent: ${errorInfo.isPermanent ? "Yes" : "No"}`);
        logs.push(`  Should Cleanup Token: ${errorInfo.shouldCleanupToken ? "Yes" : "No"}`);

        // Log FCM error using structured logging
        logger.logFCMError("FCM push notification failed", {
          fcmErrorCode: String(errorData.error.code),
          fcmErrorType: errorInfo.type,
          isPermanent: errorInfo.isPermanent,
          shouldCleanupToken: errorInfo.shouldCleanupToken,
          requestPayload: {
            token: fcmToken.substring(0, 30) + "...",
            title,
            body,
            dataKeys: Object.keys(data),
          },
          errorMessage: errorData.error.message,
        });

        if (errorInfo.isPermanent) {
          const totalDuration = Date.now() - startTime;
          logs.push(`[${new Date().toISOString()}] 🚫 Permanent error - stopping retries after ${totalDuration}ms`);
          return {
            success: false,
            logs,
            finalError: errorData.error.message,
            errorType: errorInfo.type,
            shouldCleanupToken: errorInfo.shouldCleanupToken,
          };
        }

        if (attempt === MAX_RETRIES) {
          const totalDuration = Date.now() - startTime;
          logs.push(`[${new Date().toISOString()}] 🚫 All ${MAX_RETRIES} attempts failed after ${totalDuration}ms`);
          return {
            success: false,
            logs,
            finalError: errorData.error.message,
            errorType: errorInfo.type,
            shouldCleanupToken: errorInfo.shouldCleanupToken,
          };
        }

        const delay = RETRY_DELAYS[attempt - 1];
        logs.push(`[${new Date().toISOString()}] ⏳ Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Success
      const result: FCMResponse = await response.json();
      const attemptDuration = Date.now() - attemptStartTime;
      const totalDuration = Date.now() - startTime;

      logs.push(`[${new Date().toISOString()}] ✅ SUCCESS on attempt ${attempt}/${MAX_RETRIES}`);
      logs.push(`  Message ID: ${result.name}`);
      logs.push(`  Total time: ${totalDuration}ms`);
      logs.push(`  Attempt duration: ${attemptDuration}ms`);

      return {
        success: true,
        logs,
        messageId: result.name,
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
          errorType: "UNKNOWN_ERROR",
          shouldCleanupToken: false,
        };
      }

      const delay = RETRY_DELAYS[attempt - 1];
      logs.push(`[${new Date().toISOString()}] ⏳ Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
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
 * Simple FCM send function (for backward compatibility)
 */
export async function sendFCMNotification(
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  env: Env,
  logger: Logger
): Promise<boolean> {
  const result = await sendFCMNotificationWithLogs(fcmToken, title, body, data, env, logger);
  return result.success;
}

