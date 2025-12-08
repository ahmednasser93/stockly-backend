import { describe, it, expect, beforeEach, vi } from "vitest";
import { Logger, extractUserId, type LogContext } from "../../src/logging/logger";

describe("Logger", () => {
  let logger: Logger;
  let context: LogContext;

  beforeEach(() => {
    context = {
      traceId: "test-trace-123",
      userId: "user-456",
      path: "/v1/api/test",
      service: "stockly-api-test",
    };
    logger = new Logger(context);
    // Don't spy on console methods - they're implementation details
    // Focus on testing the log entries created
  });

  describe("constructor", () => {
    it("should initialize with context", () => {
      expect(logger.getContext()).toEqual(context);
    });

    it("should start with empty log buffer", () => {
      expect(logger.getLogs()).toEqual([]);
    });
  });

  describe("debug", () => {
    it("should create debug log entry", () => {
      logger.debug("Debug message", { extra: "data" });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "DEBUG",
        message: "Debug message",
        traceId: "test-trace-123",
        userId: "user-456",
        path: "/v1/api/test",
        service: "stockly-api-test",
        type: "general",
        extra: "data",
      });
      expect(logs[0]).toHaveProperty("timestamp");
    });
  });

  describe("info", () => {
    it("should create info log entry", () => {
      logger.info("Info message", { action: "test" });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "INFO",
        message: "Info message",
        type: "general",
        action: "test",
      });
    });
  });

  describe("warn", () => {
    it("should create warn log entry", () => {
      logger.warn("Warning message", { warning: "test" });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "WARN",
        message: "Warning message",
        type: "general",
        warning: "test",
      });
    });
  });

  describe("error", () => {
    it("should create error log entry with Error object", () => {
      const error = new Error("Test error");
      error.stack = "Error stack trace";
      logger.error("Error message", error, { context: "test" });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "ERROR",
        message: "Error message",
        type: "general",
        context: "test",
        error: {
          name: "Error",
          message: "Test error",
          stack: "Error stack trace",
        },
      });
      // console.error is called, but we can't easily spy on it in this context
      // The important thing is the log entry was created correctly
    });

    it("should create error log entry with string error", () => {
      logger.error("Error message", "String error", { context: "test" });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "ERROR",
        message: "Error message",
        error: "String error",
      });
    });

    it("should create error log entry without error", () => {
      logger.error("Error message", undefined, { context: "test" });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).not.toHaveProperty("error");
    });
  });

  describe("logApiCall", () => {
    it("should create API call log entry", () => {
      logger.logApiCall("API call made", {
        apiProvider: "FMP",
        endpoint: "/quote",
        method: "GET",
        statusCode: 200,
        latencyMs: 150,
      });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "DEBUG",
        message: "API call made",
        type: "api_call",
        apiProvider: "FMP",
        endpoint: "/quote",
        method: "GET",
        statusCode: 200,
        latencyMs: 150,
      });
      // Console.log is called but we focus on log entry structure
    });

    it("should create API call log entry with partial options", () => {
      logger.logApiCall("API call", {
        apiProvider: "FMP",
        latencyMs: 100,
      });

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        type: "api_call",
        apiProvider: "FMP",
        latencyMs: 100,
      });
    });
  });

  describe("logDataOperation", () => {
    it("should create D1 operation log entry", () => {
      logger.logDataOperation("D1 query executed", {
        operation: "d1",
        query: "SELECT * FROM alerts",
        latencyMs: 25,
        cacheStatus: "N/A",
      });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "DEBUG",
        message: "D1 query executed",
        type: "data_operation",
        operation: "d1",
        query: "SELECT * FROM alerts",
        latencyMs: 25,
        cacheStatus: "N/A",
      });
      // Console.log is called but we focus on log entry structure
    });

    it("should create KV operation log entry with HIT", () => {
      logger.logDataOperation("KV get", {
        operation: "kv",
        key: "cache:key",
        latencyMs: 5,
        cacheStatus: "HIT",
      });

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "kv",
        key: "cache:key",
        cacheStatus: "HIT",
      });
    });

    it("should create KV operation log entry with MISS", () => {
      logger.logDataOperation("KV get", {
        operation: "kv",
        key: "cache:key",
        latencyMs: 5,
        cacheStatus: "MISS",
      });

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        cacheStatus: "MISS",
      });
    });

    it("should create data operation log entry with error", () => {
      logger.logDataOperation("D1 query failed", {
        operation: "d1",
        query: "SELECT * FROM alerts",
        latencyMs: 25,
        cacheStatus: "N/A",
        error: "Database connection failed",
      });

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        error: "Database connection failed",
      });
    });
  });

  describe("logFCMError", () => {
    it("should create FCM error log entry", () => {
      logger.logFCMError("FCM notification failed", {
        fcmErrorCode: "5",
        fcmErrorType: "NOT_FOUND",
        isPermanent: true,
        shouldCleanupToken: true,
        requestPayload: {
          token: "fcm-token",
          title: "Alert",
          body: "Price alert",
        },
        errorMessage: "Token not found",
      });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: "ERROR",
        message: "FCM notification failed",
        type: "fcm_error",
        fcmErrorCode: "5",
        fcmErrorType: "NOT_FOUND",
        isPermanent: true,
        shouldCleanupToken: true,
        requestPayload: {
          token: "fcm-token",
          title: "Alert",
          body: "Price alert",
        },
        errorMessage: "Token not found",
      });
      // console.error is called, but we can't easily spy on it in this context
      // The important thing is the log entry was created correctly
    });
  });

  describe("getLogs", () => {
    it("should return copy of log buffer", () => {
      logger.info("Message 1");
      logger.info("Message 2");

      const logs1 = logger.getLogs();
      const logs2 = logger.getLogs();

      expect(logs1).toEqual(logs2);
      expect(logs1).not.toBe(logs2); // Should be different instances
      expect(logs1).toHaveLength(2);
    });
  });

  describe("clearLogs", () => {
    it("should clear log buffer", () => {
      logger.info("Message 1");
      logger.info("Message 2");
      expect(logger.getLogs()).toHaveLength(2);

      logger.clearLogs();
      expect(logger.getLogs()).toHaveLength(0);
    });
  });

  describe("updateContext", () => {
    it("should update context", () => {
      logger.updateContext({ userId: "new-user" });

      expect(logger.getContext().userId).toBe("new-user");
      expect(logger.getContext().traceId).toBe("test-trace-123"); // Other fields unchanged
    });

    it("should update multiple context fields", () => {
      logger.updateContext({
        userId: "new-user",
        path: "/v1/api/new-path",
      });

      const updatedContext = logger.getContext();
      expect(updatedContext.userId).toBe("new-user");
      expect(updatedContext.path).toBe("/v1/api/new-path");
      expect(updatedContext.traceId).toBe("test-trace-123");
    });

    it("should use updated context in new logs", () => {
      logger.updateContext({ userId: "updated-user" });
      logger.info("New message");

      const logs = logger.getLogs();
      expect(logs[0].userId).toBe("updated-user");
    });
  });

  describe("getContext", () => {
    it("should return copy of context", () => {
      const context1 = logger.getContext();
      const context2 = logger.getContext();

      expect(context1).toEqual(context2);
      expect(context1).not.toBe(context2); // Should be different instances
    });
  });

  describe("log entry structure", () => {
    it("should include all required fields", () => {
      logger.info("Test message");

      const log = logger.getLogs()[0];
      expect(log).toHaveProperty("timestamp");
      expect(log).toHaveProperty("service");
      expect(log).toHaveProperty("level");
      expect(log).toHaveProperty("traceId");
      expect(log).toHaveProperty("userId");
      expect(log).toHaveProperty("path");
      expect(log).toHaveProperty("message");
    });

    it("should handle null userId", () => {
      const loggerWithNullUser = new Logger({
        ...context,
        userId: null,
      });
      loggerWithNullUser.info("Test");

      const log = loggerWithNullUser.getLogs()[0];
      expect(log.userId).toBeNull();
    });

    it("should handle undefined userId", () => {
      const loggerWithUndefinedUser = new Logger({
        traceId: "test",
        path: "/test",
        service: "test",
      });
      loggerWithUndefinedUser.info("Test");

      const log = loggerWithUndefinedUser.getLogs()[0];
      expect(log.userId).toBeNull();
    });
  });
});

describe("extractUserId", () => {
  it("should extract userId from push-token path", () => {
    const request = new Request("https://example.com/v1/api/push-token/user123");
    const userId = extractUserId(request, "/v1/api/push-token/user123");
    expect(userId).toBe("user123");
  });

  it("should extract userId from preferences path", () => {
    const request = new Request("https://example.com/v1/api/preferences/user456");
    const userId = extractUserId(request, "/v1/api/preferences/user456");
    expect(userId).toBe("user456");
  });

  it("should extract userId from settings path", () => {
    const request = new Request("https://example.com/v1/api/settings/user789");
    const userId = extractUserId(request, "/v1/api/settings/user789");
    expect(userId).toBe("user789");
  });

  it("should extract userId from devices path", () => {
    const request = new Request("https://example.com/v1/api/devices/user999");
    const userId = extractUserId(request, "/v1/api/devices/user999");
    expect(userId).toBe("user999");
  });

  it("should return null when userId not in path", () => {
    const request = new Request("https://example.com/v1/api/get-stock");
    const userId = extractUserId(request, "/v1/api/get-stock");
    expect(userId).toBeNull();
  });

  it("should return null for paths without userId pattern", () => {
    const request = new Request("https://example.com/v1/api/alerts");
    const userId = extractUserId(request, "/v1/api/alerts");
    expect(userId).toBeNull();
  });

  it("should extract userId from path with query params", () => {
    const request = new Request("https://example.com/v1/api/preferences/user123?foo=bar");
    const userId = extractUserId(request, "/v1/api/preferences/user123");
    expect(userId).toBe("user123");
  });
});

