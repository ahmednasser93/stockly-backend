/**
 * Structured JSON Logging Utility
 * 
 * Ensures all logs are valid JSON objects with required fields for
 * searching and correlation in Grafana Loki.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogContext {
  traceId: string;
  userId?: string | null;
  path: string;
  service: string;
}

export interface BaseLogEntry {
  timestamp: string;
  service: string;
  level: LogLevel;
  traceId: string;
  userId?: string | null;
  path: string;
  message: string;
}

export interface ApiCallLogEntry extends BaseLogEntry {
  type: "api_call";
  apiProvider?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  latencyMs?: number;
}

export interface DataOperationLogEntry extends BaseLogEntry {
  type: "data_operation";
  operation: "d1" | "kv";
  query?: string;
  key?: string;
  latencyMs: number;
  cacheStatus?: "HIT" | "MISS" | "N/A";
  error?: string;
}

export interface FCMErrorLogEntry extends BaseLogEntry {
  type: "fcm_error";
  fcmErrorCode: string;
  fcmErrorType: string;
  isPermanent: boolean;
  shouldCleanupToken: boolean;
  requestPayload?: Record<string, unknown>;
  errorMessage: string;
}

export interface GeneralLogEntry extends BaseLogEntry {
  type?: "general";
  [key: string]: unknown;
}

export type LogEntry = BaseLogEntry | ApiCallLogEntry | DataOperationLogEntry | FCMErrorLogEntry | GeneralLogEntry;

/**
 * Logger class that maintains a log buffer and context
 */
export class Logger {
  private logBuffer: LogEntry[] = [];
  private context: LogContext;

  constructor(context: LogContext) {
    this.context = context;
  }

  /**
   * Get the current log buffer (for shipping)
   */
  getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * Clear the log buffer
   */
  clearLogs(): void {
    this.logBuffer = [];
  }

  /**
   * Create a base log entry with context
   */
  private createBaseLog(level: LogLevel, message: string): BaseLogEntry {
    return {
      timestamp: new Date().toISOString(),
      service: this.context.service,
      level,
      traceId: this.context.traceId,
      userId: this.context.userId ?? null,
      path: this.context.path,
      message,
    };
  }

  /**
   * Log a debug message
   */
  debug(message: string, extra?: Record<string, unknown>): void {
    const entry: GeneralLogEntry = {
      ...this.createBaseLog("DEBUG", message),
      type: "general",
      ...extra,
    };
    this.logBuffer.push(entry);
    // Also output to console for local development
    console.log(JSON.stringify(entry));
  }

  /**
   * Log an info message
   */
  info(message: string, extra?: Record<string, unknown>): void {
    const entry: GeneralLogEntry = {
      ...this.createBaseLog("INFO", message),
      type: "general",
      ...extra,
    };
    this.logBuffer.push(entry);
    console.log(JSON.stringify(entry));
  }

  /**
   * Log a warning message
   */
  warn(message: string, extra?: Record<string, unknown>): void {
    const entry: GeneralLogEntry = {
      ...this.createBaseLog("WARN", message),
      type: "general",
      ...extra,
    };
    this.logBuffer.push(entry);
    console.warn(JSON.stringify(entry));
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, extra?: Record<string, unknown>): void {
    const entry: GeneralLogEntry = {
      ...this.createBaseLog("ERROR", message),
      type: "general",
      ...extra,
    };

    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      entry.error = String(error);
    }

    this.logBuffer.push(entry);
    console.error(JSON.stringify(entry));
  }

  /**
   * Log an API call (e.g., to FMP API)
   */
  logApiCall(
    message: string,
    options: {
      apiProvider?: string;
      endpoint?: string;
      method?: string;
      statusCode?: number;
      latencyMs?: number;
    }
  ): void {
    const entry: ApiCallLogEntry = {
      ...this.createBaseLog("DEBUG", message),
      type: "api_call",
      ...options,
    };
    this.logBuffer.push(entry);
    console.log(JSON.stringify(entry));
  }

  /**
   * Log a D1 or KV operation with latency and cache status
   */
  logDataOperation(
    message: string,
    options: {
      operation: "d1" | "kv";
      query?: string;
      key?: string;
      latencyMs: number;
      cacheStatus?: "HIT" | "MISS" | "N/A";
      error?: string;
    }
  ): void {
    const entry: DataOperationLogEntry = {
      ...this.createBaseLog("DEBUG", message),
      type: "data_operation",
      ...options,
    };
    this.logBuffer.push(entry);
    console.log(JSON.stringify(entry));
  }

  /**
   * Log an FCM push notification failure
   */
  logFCMError(
    message: string,
    options: {
      fcmErrorCode: string;
      fcmErrorType: string;
      isPermanent: boolean;
      shouldCleanupToken: boolean;
      requestPayload?: Record<string, unknown>;
      errorMessage: string;
    }
  ): void {
    const entry: FCMErrorLogEntry = {
      ...this.createBaseLog("ERROR", message),
      type: "fcm_error",
      ...options,
    };
    this.logBuffer.push(entry);
    console.error(JSON.stringify(entry));
  }

  /**
   * Update the context (e.g., when userId becomes available)
   */
  updateContext(updates: Partial<LogContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Get current context
   */
  getContext(): LogContext {
    return { ...this.context };
  }
}

/**
 * Helper function to extract userId from request path or headers
 * Supports both legacy URL params and JWT tokens (from Authorization header or cookies)
 */
export function extractUserId(request: Request, pathname: string): string | null {
  // Try to extract from path (e.g., /v1/api/preferences/:userId)
  const userIdPatterns = [
    /\/push-token\/([^\/]+)/,
    /\/preferences\/([^\/]+)/,
    /\/settings\/([^\/]+)/,
    /\/devices\/([^\/]+)/,
  ];

  for (const pattern of userIdPatterns) {
    const match = pathname.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Try to extract from Authorization header (JWT token)
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      // Decode JWT without verification (just for logging)
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0))
          )
        );
        return payload.userId || null;
      }
    } catch {
      // Invalid token format, ignore
    }
  }

  // Try to extract from httpOnly cookie (webapp)
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
      const [name, value] = cookie.trim().split("=");
      if (name && value) {
        acc[name] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);

    if (cookies.accessToken) {
      try {
        const parts = cookies.accessToken.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(
            new TextDecoder().decode(
              Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0))
            )
          );
          return payload.userId || null;
        }
      } catch {
        // Invalid token format, ignore
      }
    }
  }

  return null;
}


