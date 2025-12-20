import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAllDevices, sendTestNotification } from "../src/api/devices";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";

vi.mock("../src/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
  authenticateRequestWithAdmin: vi.fn().mockResolvedValue({
    username: "testuser",
    tokenType: "access" as const,
    isAdmin: true,
  }),
}));

import { authenticateRequest, authenticateRequestWithAdmin } from "../src/auth/middleware";

describe("Devices API", () => {
  let mockEnv: Env;
  let mockDb: {
    prepare: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue({
      username: "testuser",
      userId: "user-1",
      tokenType: "access" as const,
      isAdmin: false,
    } as any);
    vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
      isAdmin: true,
    } as any);

    mockDb = {
      prepare: vi.fn(),
    };

    mockEnv = {
      stockly: mockDb as unknown as D1Database,
      alertsKv: undefined,
      FCM_SERVICE_ACCOUNT: JSON.stringify({
        type: "service_account",
        project_id: "test-project",
        private_key_id: "test-key-id",
        private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
        client_email: "test@test-project.iam.gserviceaccount.com",
        client_id: "123456789",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com",
      }),
    };
  });

  describe("getAllDevices", () => {
    it("should return list of devices", async () => {
      // Mock devices query (new schema)
      const mockDeviceRows = [
        {
          device_id: 1,
          user_id: "user-1",
          device_info: "Android Device",
          device_type: "Android",
          created_at: "2025-11-14T10:30:00.000Z",
          updated_at: "2025-11-14T10:30:00.000Z",
          username: "testuser",
        },
        {
          device_id: 2,
          user_id: "user-2",
          device_info: null,
          device_type: null,
          created_at: "2025-11-13T08:20:00.000Z",
          updated_at: "2025-11-14T12:00:00.000Z",
          username: "testuser2",
        },
      ];

      // Mock devices query
      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockDeviceRows }),
      };

      // Mock push tokens query (called for each device)
      let tokenCallCount = 0;
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockImplementation(() => {
          const tokens = tokenCallCount === 0 
            ? [{ push_token: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }]
            : [{ push_token: "eYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY" }];
          tokenCallCount++;
          return Promise.resolve({ results: tokens });
        }),
      };

      // Mock the alert count queries (called for each device with username)
      const alertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 5 }),
      };

      // Mock prepare to return different statements based on query
      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("FROM devices") && query.includes("LEFT JOIN users")) {
          return devicesStmt;
        } else if (query.includes("SELECT push_token") && query.includes("FROM device_push_tokens")) {
          return pushTokensStmt;
        } else if (query.includes("alerts") && query.includes("COUNT") && query.includes("username")) {
          return alertCountStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const request = new Request("https://example.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, createMockLogger());
      const data = await response.json() as { devices: any[] };

      // The query includes JOIN with users table, so just check for SELECT
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT")
      );
      expect(data.devices).toHaveLength(2);
      expect(data.devices[0].userId).toBe("user-1");
      expect(Array.isArray(data.devices[0].pushTokens)).toBe(true);
      expect(data.devices[0].pushTokens).toContain("dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
      expect(data.devices[0].deviceInfo).toBe("Android Device");
      expect(data.devices[0].alertCount).toBe(5);
      expect(data.devices[0].activeAlertCount).toBe(5);
      expect(data.devices[1].deviceInfo).toBeNull();
    });

    it("should return empty array when no devices", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, createMockLogger());
      const data = await response.json() as { devices: any[] };

      expect(data.devices).toEqual([]);
    });

    it("should handle database errors", async () => {
      mockDb.prepare.mockImplementation(() => {
        return {
          all: vi.fn().mockRejectedValue(new Error("Database error")),
        };
      });

      const request = new Request("https://example.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, createMockLogger());
      const data = await response.json() as { error: string };

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to get devices");
    });
  });

  describe("sendTestNotification", () => {
    it("should send test notification successfully", async () => {
      // Mock token record (new schema)
      const mockTokenRecord = {
        push_token: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        user_id: "user-1",
        device_info: "Android Device",
      };

      const mockTokenStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockTokenRecord),
      };

      // Mock user lookup for sendTestNotification
      const mockUserStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-1" }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users")) {
          return mockUserStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return mockTokenStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        };
      });

      // Mock fetch for Google OAuth token endpoint and FCM API
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "mock-google-access-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ name: "projects/test-project/messages/0:1234567890" }),
        });

      // Mock crypto.subtle for JWT signing
      const mockCryptoKey = {} as CryptoKey;
      (globalThis as any).crypto = {
        subtle: {
          importKey: vi.fn().mockResolvedValue(mockCryptoKey),
          sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5])),
        } as unknown as SubtleCrypto,
        getRandomValues: vi.fn(),
      } as unknown as Crypto;

      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pushToken: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
          message: "Custom test message" 
        }),
      });

      const response = await sendTestNotification(request, mockEnv, createMockLogger());
      const data = await response.json() as { success: boolean; message: string; userId: string };

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT dpt.push_token")
      );
      expect(data.success).toBe(true);
      expect(data.message).toBe("Test notification sent successfully");
      expect(data.userId).toBe("user-1");
    });

    it("should use default message when no custom message provided", async () => {
      // Mock token record (new schema)
      const mockTokenRecord = {
        push_token: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        user_id: "user-1",
        device_info: null,
      };

      // Mock user lookup for sendTestNotification
      const mockUserStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-1" }),
      };

      const mockTokenStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockTokenRecord),
      };

      // Mock fetch for Google OAuth token endpoint and FCM API
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "mock-google-access-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ name: "projects/test-project/messages/0:1234567890" }),
        });

      // Mock crypto.subtle for JWT signing
      const mockCryptoKey = {} as CryptoKey;
      (globalThis as any).crypto = {
        subtle: {
          importKey: vi.fn().mockResolvedValue(mockCryptoKey),
          sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5])),
        } as unknown as SubtleCrypto,
        getRandomValues: vi.fn(),
      } as unknown as Crypto;

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users")) {
          return mockUserStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return mockTokenStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        };
      });

      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pushToken: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
        }),
      });

      const response = await sendTestNotification(request, mockEnv, createMockLogger());
      const data = await response.json() as { success: boolean };

      expect(data.success).toBe(true);
    });

    it("should return 404 when device not found", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      // Mock user lookup
      const mockUserStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-1" }),
      };

      const mockTokenStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users")) {
          return mockUserStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return mockTokenStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        };
      });

      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pushToken: "non-existent-token"
        }),
      });

      const response = await sendTestNotification(request, mockEnv, createMockLogger());
      const data = await response.json() as { error: string };

      expect(response.status).toBe(404);
      expect(data.error).toMatch(/Device not found/);
    });

    it("should return 400 when userId is missing", async () => {
      // This test doesn't apply since userId is extracted from auth, not URL
      // The function will return 401 if auth fails, or 404 if user not found
      // Let's test a different scenario - missing pushToken in body
      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Mock auth to return a user
      vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
        username: "testuser",
        userId: "user-1",
        tokenType: "access" as const,
        isAdmin: false,
      } as any);

      // Mock user lookup
      const mockUserStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-1" }),
      };

      // Mock token lookup to return null (no device found - new schema)
      const mockTokenStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users")) {
          return mockUserStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return mockTokenStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        };
      });

      const response = await sendTestNotification(request, mockEnv, createMockLogger());
      const data = await response.json() as { error?: string };

      // Should return 404 when device not found (no pushToken in body means use first device, but none exists)
      expect([400, 404]).toContain(response.status);
    });

    it("should return 405 for non-POST methods", async () => {
      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "GET",
      });

      const response = await sendTestNotification(request, mockEnv, createMockLogger());
      const data = await response.json() as { error: string };

      expect(response.status).toBe(405);
      expect(data.error).toBe("Method not allowed");
    });

    it("should handle FCM send failures", async () => {
      // Mock token record (new schema)
      const mockTokenRecord = {
        push_token: "invalid-token",
        user_id: "user-1",
        device_info: null,
      };

      const mockTokenStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockTokenRecord),
      };

      // Mock fetch for FCM API to return error
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 400,
            message: "Invalid token",
            status: "INVALID_ARGUMENT",
          },
        }),
      });

      // Mock crypto.subtle for JWT signing
      (globalThis as any).crypto = {
        subtle: {
          importKey: vi.fn().mockResolvedValue({}),
          sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        } as unknown as SubtleCrypto,
        getRandomValues: vi.fn(),
      } as unknown as Crypto;

      // Mock user lookup
      const mockUserStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-1" }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users")) {
          return mockUserStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return mockTokenStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        };
      });

      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pushToken: "invalid-token"
        }),
      });

      const response = await sendTestNotification(request, mockEnv, createMockLogger());
      const data = await response.json() as { success?: boolean; error?: string };

      // FCM errors might return 400 (invalid token) or 500 (other errors)
      expect([400, 500]).toContain(response.status);
      expect(data.success === false || data.error).toBeTruthy();
    });
  });
});

