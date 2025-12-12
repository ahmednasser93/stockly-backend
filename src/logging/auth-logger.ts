/**
 * Authentication Event Logger
 * 
 * Specialized logging for authentication events
 */

import type { Logger } from "./logger";

export interface AuthEvent {
  type: "sign_in" | "sign_out" | "token_refresh" | "username_set" | "username_check";
  userId?: string | null;
  email?: string;
  success: boolean;
  error?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp: string;
}

/**
 * Log authentication event
 * @param logger - Logger instance
 * @param event - Authentication event data
 */
export function logAuthEvent(logger: Logger, event: Omit<AuthEvent, "timestamp">): void {
  const authEvent: AuthEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  if (event.success) {
    logger.info(`Auth event: ${event.type}`, {
      type: "auth_event",
      ...authEvent,
    });
  } else {
    logger.warn(`Auth event failed: ${event.type}`, {
      type: "auth_event",
      ...authEvent,
    });
  }
}

/**
 * Extract IP address from request
 * @param request - HTTP request
 * @returns IP address or null
 */
export function extractIpAddress(request: Request): string | null {
  // Check Cloudflare headers first
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to X-Forwarded-For
  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }

  return null;
}

/**
 * Extract user agent from request
 * @param request - HTTP request
 * @returns User agent or null
 */
export function extractUserAgent(request: Request): string | null {
  return request.headers.get("User-Agent");
}
