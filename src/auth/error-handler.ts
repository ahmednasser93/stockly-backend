/**
 * Standardized Error Handling for Authentication
 * 
 * Provides consistent error response format and error codes
 */

import { getCorsHeaders } from "../util";

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type AuthErrorCode =
  | "AUTH_INVALID_TOKEN"
  | "AUTH_MISSING_TOKEN"
  | "AUTH_FORBIDDEN"
  | "AUTH_GOOGLE_VERIFICATION_FAILED"
  | "USERNAME_INVALID_FORMAT"
  | "USERNAME_TAKEN"
  | "USERNAME_RESERVED"
  | "USERNAME_ALREADY_SET"
  | "RATE_LIMIT_EXCEEDED"
  | "NETWORK_ERROR"
  | "INTERNAL_ERROR"
  | "USER_NOT_FOUND"
  | "ALERT_NOT_FOUND"
  | "INVALID_INPUT"
  | "UPDATE_FAILED"
  | "DELETE_FAILED"
  | "CREATE_FAILED";

/**
 * Create standardized error response
 * @param code - Error code
 * @param message - User-friendly error message
 * @param details - Optional additional details (for debugging, not exposed to users)
 * @param status - HTTP status code (default: 400)
 * @param request - Request object for CORS headers (optional)
 * @returns Error response object
 */
export function createErrorResponse(
  code: AuthErrorCode,
  message: string,
  details?: Record<string, unknown>,
  status?: number,
  request?: Request
): { response: Response; error: ApiError } {
  const httpStatus = status || getErrorStatus(code);
  const error: ApiError = {
    code,
    message,
    ...(details && { details }),
  };

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Add CORS headers if request is provided
  if (request) {
    Object.assign(headers, getCorsHeaders(request));
  }

  return {
    response: new Response(
      JSON.stringify({ error }),
      {
        status: httpStatus,
        headers,
      }
    ),
    error,
  };
}

/**
 * Error code to HTTP status mapping
 */
const ERROR_STATUS_MAP: Record<AuthErrorCode, number> = {
  AUTH_INVALID_TOKEN: 401,
  AUTH_MISSING_TOKEN: 401,
  AUTH_FORBIDDEN: 403,
  AUTH_GOOGLE_VERIFICATION_FAILED: 401,
  USERNAME_INVALID_FORMAT: 400,
  USERNAME_TAKEN: 400,
  USERNAME_RESERVED: 400,
  USERNAME_ALREADY_SET: 409,
  RATE_LIMIT_EXCEEDED: 429,
  NETWORK_ERROR: 503,
  INTERNAL_ERROR: 500,
  USER_NOT_FOUND: 404,
  ALERT_NOT_FOUND: 404,
  INVALID_INPUT: 400,
  UPDATE_FAILED: 400,
  DELETE_FAILED: 400,
  CREATE_FAILED: 400,
};

/**
 * Get HTTP status code for error code
 * @param code - Error code
 * @returns HTTP status code
 */
export function getErrorStatus(code: AuthErrorCode): number {
  return ERROR_STATUS_MAP[code] || 400;
}
