import { describe, it, expect, beforeEach, vi } from "vitest";
import { sendLogsToLoki, type LokiConfig } from "../../src/logging/loki-shipper";
import type { LogEntry } from "../../src/logging/logger";

describe("Loki Shipper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("sendLogsToLoki", () => {
    const mockLogs: LogEntry[] = [
      {
        timestamp: "2025-01-01T00:00:00.000Z",
        service: "stockly-api",
        level: "INFO",
        traceId: "trace-1",
        userId: "user-1",
        path: "/v1/api/test",
        message: "Test message",
        type: "general",
      },
      {
        timestamp: "2025-01-01T00:00:01.000Z",
        service: "stockly-api",
        level: "ERROR",
        traceId: "trace-1",
        userId: "user-1",
        path: "/v1/api/test",
        message: "Error message",
        type: "general",
      },
    ];

    it("should ship logs successfully", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
        username: "user123",
        password: "token123",
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await sendLogsToLoki(mockLogs, config);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const call = vi.mocked(global.fetch).mock.calls[0];
      expect(call[0]).toBe("https://logs.example.com/loki/api/v1/push");
      expect(call[1]).toMatchObject({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: expect.stringContaining("Basic"),
        },
      });

      const body = JSON.parse(call[1]?.body as string);
      expect(body).toHaveProperty("streams");
      expect(body.streams).toHaveLength(1);
      expect(body.streams[0]).toHaveProperty("stream");
      expect(body.streams[0]).toHaveProperty("values");
      expect(body.streams[0].values).toHaveLength(2);
    });

    it("should format timestamps as nanoseconds", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await sendLogsToLoki(mockLogs, config);

      const call = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      const values = body.streams[0].values;

      // Check that timestamps are in nanoseconds (much larger than milliseconds)
      expect(parseInt(values[0][0])).toBeGreaterThan(1000000000000000000); // 2025 in nanoseconds
      expect(values[0][1]).toBe(JSON.stringify(mockLogs[0]));
    });

    it("should handle URL with trailing slash", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com/",
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await sendLogsToLoki(mockLogs, config);

      const call = vi.mocked(global.fetch).mock.calls[0];
      expect(call[0]).toBe("https://logs.example.com/loki/api/v1/push");
    });

    it("should include Basic Auth when credentials provided", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
        username: "user123",
        password: "pass456",
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await sendLogsToLoki(mockLogs, config);

      const call = vi.mocked(global.fetch).mock.calls[0];
      const headers = call[1]?.headers as HeadersInit;
      expect(headers["Authorization"]).toContain("Basic");
      
      // Verify base64 encoding
      const authHeader = headers["Authorization"] as string;
      const base64 = authHeader.replace("Basic ", "");
      const decoded = atob(base64);
      expect(decoded).toBe("user123:pass456");
    });

    it("should not include Auth when credentials not provided", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await sendLogsToLoki(mockLogs, config);

      const call = vi.mocked(global.fetch).mock.calls[0];
      const headers = call[1]?.headers as HeadersInit;
      expect(headers).not.toHaveProperty("Authorization");
    });

    it("should include custom labels", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
        labels: {
          environment: "production",
          region: "us-east",
        },
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await sendLogsToLoki(mockLogs, config);

      const call = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.streams[0].stream).toMatchObject({
        service: "stockly-api",
        environment: "production",
        region: "us-east",
      });
    });

    it("should return early if no logs", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
      };

      await sendLogsToLoki([], config);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should return early if URL not configured", async () => {
      const config: LokiConfig = {
        url: "",
      };

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await sendLogsToLoki(mockLogs, config);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("LOKI_URL not configured")
      );
    });

    it("should handle non-200 response", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid credentials",
      } as Response);

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await sendLogsToLoki(mockLogs, config);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to ship logs")
      );
    });

    it("should handle network errors gracefully", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
      };

      vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await sendLogsToLoki(mockLogs, config);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to ship logs")
      );
    });

    it("should handle fetch text() error", async () => {
      const config: LokiConfig = {
        url: "https://logs.example.com",
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => {
          throw new Error("Failed to read response");
        },
      } as Response);

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await sendLogsToLoki(mockLogs, config);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("should format logs correctly with all log types", async () => {
      const mixedLogs: LogEntry[] = [
        {
          timestamp: "2025-01-01T00:00:00.000Z",
          service: "stockly-api",
          level: "INFO",
          traceId: "trace-1",
          userId: null,
          path: "/test",
          message: "General log",
          type: "general",
        },
        {
          timestamp: "2025-01-01T00:00:01.000Z",
          service: "stockly-api",
          level: "DEBUG",
          traceId: "trace-1",
          userId: null,
          path: "/test",
          message: "API call",
          type: "api_call",
          apiProvider: "FMP",
          endpoint: "/quote",
          statusCode: 200,
          latencyMs: 150,
        },
        {
          timestamp: "2025-01-01T00:00:02.000Z",
          service: "stockly-api",
          level: "DEBUG",
          traceId: "trace-1",
          userId: null,
          path: "/test",
          message: "D1 query",
          type: "data_operation",
          operation: "d1",
          query: "SELECT * FROM alerts",
          latencyMs: 25,
          cacheStatus: "N/A",
        },
      ];

      const config: LokiConfig = {
        url: "https://logs.example.com",
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await sendLogsToLoki(mixedLogs, config);

      const call = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.streams[0].values).toHaveLength(3);
      
      // Verify each log is JSON stringified
      expect(JSON.parse(body.streams[0].values[0][1])).toEqual(mixedLogs[0]);
      expect(JSON.parse(body.streams[0].values[1][1])).toEqual(mixedLogs[1]);
      expect(JSON.parse(body.streams[0].values[2][1])).toEqual(mixedLogs[2]);
    });
  });
});


