import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAllDevices, sendTestNotification } from "../src/api/devices";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";

describe("Devices API", () => {
  let mockEnv: Env;
  let mockDb: {
    prepare: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
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
      const mockDevices = [
        {
          user_id: "user-1",
          push_token: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
          device_info: "Android Device",
          created_at: "2025-11-14T10:30:00.000Z",
          updated_at: "2025-11-14T10:30:00.000Z",
        },
        {
          user_id: "user-2",
          push_token: "eYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY",
          device_info: null,
          created_at: "2025-11-13T08:20:00.000Z",
          updated_at: "2025-11-14T12:00:00.000Z",
        },
      ];

      // Mock the main query (SELECT user_id, push_token, device_info FROM user_push_tokens)
      const mainQueryStmt = {
        all: vi.fn().mockResolvedValue({ results: mockDevices }),
      };

      // Mock the alert count queries (called for each device)
      const alertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 5 }),
      };

      // Mock prepare to return different statements based on query
      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("user_push_tokens")) {
          return mainQueryStmt;
        } else if (query.includes("alerts") && query.includes("COUNT")) {
          return alertCountStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const response = await getAllDevices(mockEnv, createMockLogger());
      const data = await response.json();

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT user_id, push_token, device_info")
      );
      expect(data.devices).toHaveLength(2);
      expect(data.devices[0].userId).toBe("user-1");
      expect(data.devices[0].pushToken).toBe("dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
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

      const response = await getAllDevices(mockEnv, createMockLogger());
      const data = await response.json();

      expect(data.devices).toEqual([]);
    });

    it("should handle database errors", async () => {
      mockDb.prepare.mockImplementation(() => {
        return {
          all: vi.fn().mockRejectedValue(new Error("Database error")),
        };
      });

      const response = await getAllDevices(mockEnv, createMockLogger());
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to get devices");
    });
  });

  describe("sendTestNotification", () => {
    it("should send test notification successfully", async () => {
      const mockDevice = {
        user_id: "user-1",
        push_token: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        device_info: "Android Device",
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockDevice),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      // Mock fetch for Google OAuth token endpoint and FCM API
      global.fetch = vi.fn()
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
      global.crypto = {
        subtle: {
          importKey: vi.fn().mockResolvedValue(mockCryptoKey),
          sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5])),
        } as unknown as SubtleCrypto,
        getRandomValues: vi.fn(),
      } as Crypto;

      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
        body: JSON.stringify({ message: "Custom test message" }),
      });

      const response = await sendTestNotification("user-1", request, mockEnv, createMockLogger());
      const data = await response.json();

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT user_id, push_token, device_info")
      );
      expect(data.success).toBe(true);
      expect(data.message).toBe("Test notification sent successfully");
      expect(data.userId).toBe("user-1");
    });

    it("should use default message when no custom message provided", async () => {
      const mockDevice = {
        user_id: "user-1",
        push_token: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        device_info: null,
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockDevice),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      // Mock fetch for Google OAuth token endpoint and FCM API
      global.fetch = vi.fn()
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
      global.crypto = {
        subtle: {
          importKey: vi.fn().mockResolvedValue(mockCryptoKey),
          sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5])),
        } as unknown as SubtleCrypto,
        getRandomValues: vi.fn(),
      } as Crypto;

      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
      });

      const response = await sendTestNotification("user-1", request, mockEnv, createMockLogger());
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it("should return 404 when device not found", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
      });

      const response = await sendTestNotification("user-1", request, mockEnv, createMockLogger());
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Device not found");
    });

    it("should return 400 when userId is missing", async () => {
      const request = new Request("http://localhost/v1/api/devices//test", {
        method: "POST",
      });

      const response = await sendTestNotification("", request, mockEnv, createMockLogger());
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("userId is required");
    });

    it("should return 405 for non-POST methods", async () => {
      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "GET",
      });

      const response = await sendTestNotification("user-1", request, mockEnv, createMockLogger());
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toBe("Method not allowed");
    });

    it("should handle FCM send failures", async () => {
      const mockDevice = {
        user_id: "user-1",
        push_token: "invalid-token",
        device_info: null,
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockDevice),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      // Mock fetch for FCM API to return error
      global.fetch = vi.fn().mockResolvedValue({
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
      global.crypto = {
        subtle: {
          importKey: vi.fn().mockResolvedValue({}),
          sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        } as unknown as SubtleCrypto,
        getRandomValues: vi.fn(),
      } as Crypto;

      const request = new Request("http://localhost/v1/api/devices/user-1/test", {
        method: "POST",
      });

      const response = await sendTestNotification("user-1", request, mockEnv, createMockLogger());
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Failed to send test notification");
    });
  });
});

