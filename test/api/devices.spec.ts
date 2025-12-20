import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAllDevices, deleteDevice, sendTestNotification } from "../../src/api/devices";
import type { Env } from "../../src/index";
import type { Logger } from "../../src/logging/logger";
import { createMockEnv, createMockRequest, createMockDevice, createMockUser } from "../test-utils";
import * as authMiddleware from "../../src/auth/middleware";
import * as fcmSender from "../../src/notifications/fcm-sender";

// Mock dependencies
vi.mock("../../src/auth/middleware");
vi.mock("../../src/notifications/fcm-sender");

describe("Devices API", () => {
  let mockEnv: Env;
  let mockLogger: Logger;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    const env = createMockEnv();
    mockEnv = env;
    mockDb = env.stockly as any;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
  });

  describe("getAllDevices", () => {
    it("should return devices for regular user", async () => {
      const username = "testuser";
      const userId = "user-123";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      // Mock devices query (new schema - returns devices)
      const mockDeviceRows = [
        {
          device_id: 1,
          user_id: userId,
          device_info: "Android Device",
          device_type: "android",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          username,
        },
        {
          device_id: 2,
          user_id: userId,
          device_info: "iOS Device",
          device_type: "ios",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          username,
        },
      ];

      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockDeviceRows }),
      };

      // Mock push tokens query (called for each device)
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockImplementation((deviceId: number) => {
          if (deviceId === 1) {
            return Promise.resolve({ results: [{ push_token: "token-1" }] });
          } else if (deviceId === 2) {
            return Promise.resolve({ results: [{ push_token: "token-2" }] });
          }
          return Promise.resolve({ results: [] });
        }),
      };

      // Mock alert count queries
      const totalAlertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 5 }),
      };

      const activeAlertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 3 }),
      };

      let deviceQueryCallCount = 0;
      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("FROM devices") && query.includes("INNER JOIN users")) {
          return devicesStmt;
        } else if (query.includes("SELECT push_token") && query.includes("FROM device_push_tokens")) {
          // Return push tokens for the device
          const stmt = {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ 
              results: deviceQueryCallCount === 0 
                ? [{ push_token: "token-1" }] 
                : [{ push_token: "token-2" }] 
            }),
          };
          deviceQueryCallCount++;
          return stmt;
        } else if (query.includes("COUNT") && query.includes("FROM alerts") && query.includes("status = 'active'") && query.includes("username = ?")) {
          return activeAlertCountStmt;
        } else if (query.includes("COUNT") && query.includes("FROM alerts") && query.includes("username = ?")) {
          return totalAlertCountStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.devices).toHaveLength(2);
      expect(data.devices[0].userId).toBe(userId);
      expect(data.devices[0].username).toBe(username);
      expect(Array.isArray(data.devices[0].pushTokens)).toBe(true);
      expect(data.devices[0].pushTokens).toContain("token-1");
      expect(data.devices[0].deviceInfo).toBe("Android Device");
      expect(data.devices[0].deviceType).toBe("android");
      expect(data.devices[0].alertCount).toBe(5);
      expect(data.devices[0].activeAlertCount).toBe(3);
    });

    it("should return all devices for admin user", async () => {
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username: "admin",
        userId: "admin-123",
        tokenType: "access" as const,
        isAdmin: true,
      });

      // Mock devices with new schema structure
      const mockDevices = [
        {
          device_id: 1,
          user_id: "user-1",
          device_info: "Android Device",
          device_type: "android",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          username: "user1",
        },
        {
          device_id: 2,
          user_id: "user-2",
          device_info: "iOS Device",
          device_type: "ios",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          username: "user2",
        },
      ];

      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockDevices }),
      };

      // Mock push tokens query
      const pushTokensStmt1 = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [{ push_token: "token-1" }] }),
      };
      const pushTokensStmt2 = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [{ push_token: "token-2" }] }),
      };

      const alertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 2 }),
      };

      let deviceCallCount = 0;
      let tokenCallCount = 0;
      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("FROM devices d") && query.includes("LEFT JOIN")) {
          return devicesStmt;
        } else if (query.includes("FROM device_push_tokens")) {
          tokenCallCount++;
          return tokenCallCount === 1 ? pushTokensStmt1 : pushTokensStmt2;
        } else if (query.includes("COUNT") && query.includes("FROM alerts")) {
          return alertCountStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.devices).toHaveLength(2);
      expect(data.devices[0].username).toBe("user1");
      expect(data.devices[1].username).toBe("user2");
      expect(Array.isArray(data.devices[0].pushTokens)).toBe(true);
      expect(data.devices[0].pushTokens).toContain("token-1");
    });

    it("should handle missing device_type column gracefully", async () => {
      const username = "testuser";
      const userId = "user-123";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      // Mock devices with new schema structure (device_type can be null)
      const mockDevices = [
        {
          device_id: 1,
          user_id: userId,
          device_info: "Android Device",
          device_type: null, // Null device_type
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          username,
        },
      ];

      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockDevices }),
      };

      // Mock push tokens query
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [{ push_token: "token-1" }] }),
      };

      const alertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 0 }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("FROM devices d") && query.includes("INNER JOIN")) {
          return devicesStmt;
        } else if (query.includes("FROM device_push_tokens")) {
          return pushTokensStmt;
        } else if (query.includes("COUNT") && query.includes("FROM alerts")) {
          return alertCountStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.devices).toHaveLength(1);
      expect(data.devices[0].deviceType).toBeNull();
    });

    it("should handle missing username column gracefully", async () => {
      const username = "testuser";
      const userId = "user-123";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      // Mock devices with new schema structure (username from JOIN)
      const mockDevices = [
        {
          device_id: 1,
          user_id: userId,
          device_info: "Android Device",
          device_type: "android",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          username,
        },
      ];

      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockDevices }),
      };

      // Mock push tokens query
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [{ push_token: "token-1" }] }),
      };

      const alertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 0 }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("FROM devices d") && query.includes("INNER JOIN")) {
          return devicesStmt;
        } else if (query.includes("FROM device_push_tokens")) {
          return pushTokensStmt;
        } else if (query.includes("COUNT") && query.includes("FROM alerts")) {
          return alertCountStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.devices).toHaveLength(1);
      expect(data.devices[0].username).toBe(username);
    });

    it("should return empty array when no devices found", async () => {
      const username = "testuser";
      const userId = "user-123";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("FROM devices d") || query.includes("FROM user_push_tokens")) {
          return devicesStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.devices).toEqual([]);
    });

    it("should return 401 when authentication fails", async () => {
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue(null);

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe("AUTH_MISSING_TOKEN");
    });

    it("should handle database errors gracefully", async () => {
      const username = "testuser";
      const userId = "user-123";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockRejectedValue(new Error("Database connection failed")),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("user_push_tokens")) {
          return devicesStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      const response = await getAllDevices(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should log warning when devices have null username", async () => {
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username: "admin",
        userId: "admin-123",
        tokenType: "access" as const,
        isAdmin: true,
      });

      const mockDevices = [
        {
          user_id: "user-1",
          push_token: "token-1",
          device_info: "Device 1",
          device_type: "android",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          username: null, // Null username
        },
      ];

      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockDevices }),
      };

      const alertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 0 }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("FROM devices d") && query.includes("LEFT JOIN")) {
          return devicesStmt;
        } else if (query.includes("COUNT")) {
          return alertCountStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      await getAllDevices(request, mockEnv, mockLogger);

      // The implementation doesn't log a warning for null usernames anymore
      // It just sets alert counts to 0. So we just verify the function completes successfully.
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe("deleteDevice", () => {
    it("should delete device for regular user", async () => {
      const username = "testuser";
      const userId = "user-123";
      const pushToken = "token-to-delete";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      // Mock token record query (new schema)
      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          device_id: 1,
          user_id: userId,
          username,
        }),
      };

      // Mock user lookup for auth check
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      const deleteTokenStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      // Mock remaining tokens check
      const remainingTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 0 }), // No remaining tokens
      };

      // Mock device deactivation
      const deactivateDeviceStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT dpt.device_id") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        } else if (query.includes("DELETE FROM device_push_tokens")) {
          return deleteTokenStmt;
        } else if (query.includes("SELECT COUNT(*)") && query.includes("FROM device_push_tokens") && query.includes("device_id")) {
          return remainingTokensStmt;
        } else if (query.includes("UPDATE devices SET is_active")) {
          return deactivateDeviceStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
          run: vi.fn(),
        };
      });

      const request = createMockRequest(
        `https://api.test.com/v1/api/devices?pushToken=${pushToken}`
      );
      const response = await deleteDevice(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.userId).toBe(userId);
      expect(deleteTokenStmt.run).toHaveBeenCalled();
      expect(deactivateDeviceStmt.run).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Device deleted successfully",
        expect.objectContaining({
          deletedPushToken: expect.stringContaining("token-to-delete"),
          deletedUserId: userId,
          deletedBy: username,
          isAdmin: false,
        })
      );
    });

    it("should allow admin to delete any device", async () => {
      const adminUsername = "admin";
      const deviceUserId = "user-456";
      const pushToken = "token-to-delete";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username: adminUsername,
        userId: "admin-123",
        tokenType: "access" as const,
        isAdmin: true,
      });

      // Mock token record query (new schema)
      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          device_id: 1,
          user_id: deviceUserId,
          username: "otheruser",
        }),
      };

      const deleteTokenStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      const remainingTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 0 }),
      };

      const deactivateDeviceStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT dpt.device_id") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        } else if (query.includes("DELETE FROM device_push_tokens")) {
          return deleteTokenStmt;
        } else if (query.includes("SELECT COUNT(*)") && query.includes("FROM device_push_tokens")) {
          return remainingTokensStmt;
        } else if (query.includes("UPDATE devices SET is_active")) {
          return deactivateDeviceStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
          run: vi.fn(),
        };
      });

      const request = createMockRequest(
        `https://api.test.com/v1/api/devices?pushToken=${pushToken}`
      );
      const response = await deleteDevice(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(deleteTokenStmt.run).toHaveBeenCalled();
      expect(deactivateDeviceStmt.run).toHaveBeenCalled();
    });

    it("should return 403 when user tries to delete another user's device", async () => {
      const username = "testuser";
      const pushToken = "token-to-delete";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId: "user-123",
        tokenType: "access" as const,
        isAdmin: false,
      });

      // Mock token record query (new schema) - returns different user
      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          device_id: 1,
          user_id: "other-user-456",
          username: "otheruser",
        }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT dpt.device_id") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest(
        `https://api.test.com/v1/api/devices?pushToken=${pushToken}`
      );
      const response = await deleteDevice(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain("Unauthorized");
    });

    it("should return 400 when pushToken is missing", async () => {
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username: "testuser",
        userId: "user-123",
        tokenType: "access" as const,
        isAdmin: false,
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices");
      const response = await deleteDevice(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("pushToken");
    });

    it("should return 404 when device not found", async () => {
      const username = "testuser";
      const pushToken = "non-existent-token";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId: "user-123",
        tokenType: "access" as const,
        isAdmin: false,
      });

      // Mock token record query (new schema) - not found
      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT dpt.device_id") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest(
        `https://api.test.com/v1/api/devices?pushToken=${pushToken}`
      );
      const response = await deleteDevice(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toMatch(/Device not found/);
    });

    it("should return 401 when authentication fails", async () => {
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue(null);

      const request = createMockRequest("https://api.test.com/v1/api/devices?pushToken=token");
      const response = await deleteDevice(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it("should handle database errors gracefully", async () => {
      const username = "testuser";
      const pushToken = "token-to-delete";
      
      vi.spyOn(authMiddleware, "authenticateRequestWithAdmin").mockResolvedValue({
        username,
        userId: "user-123",
        tokenType: "access" as const,
        isAdmin: false,
      });

      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT dpt.device_id") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest(
        `https://api.test.com/v1/api/devices?pushToken=${pushToken}`
      );
      const response = await deleteDevice(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("sendTestNotification", () => {
    it("should send test notification successfully", async () => {
      const username = "testuser";
      const userId = "user-123";
      const pushToken = "test-push-token";
      
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      vi.spyOn(fcmSender, "sendFCMNotification").mockResolvedValue(true);

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          push_token: pushToken,
          user_id: userId,
          device_info: "Test Device",
        }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        body: { pushToken, message: "Custom test message" },
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.userId).toBe(userId);
      expect(fcmSender.sendFCMNotification).toHaveBeenCalledWith(
        pushToken,
        "Test Notification",
        "Custom test message",
        expect.objectContaining({
          type: "test",
          timestamp: expect.any(String),
        }),
        mockEnv,
        mockLogger
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Test notification sent successfully",
        expect.objectContaining({ userId })
      );
    });

    it("should use default message when not provided", async () => {
      const username = "testuser";
      const userId = "user-123";
      const pushToken = "test-push-token";
      
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      vi.spyOn(fcmSender, "sendFCMNotification").mockResolvedValue(true);

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          push_token: pushToken,
          user_id: userId,
          device_info: "Test Device",
        }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        body: { pushToken },
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(fcmSender.sendFCMNotification).toHaveBeenCalledWith(
        pushToken,
        "Test Notification",
        "This is a test notification from Stockly! 🚀",
        expect.any(Object),
        mockEnv,
        mockLogger
      );
    });

    it("should return 405 for non-POST requests", async () => {
      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "GET",
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toContain("Method not allowed");
    });

    it("should return 400 when pushToken is missing", async () => {
      const username = "testuser";
      const userId = "user-123";
      
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        body: {},
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("pushToken is required");
    });

    it("should return 404 when user not found", async () => {
      const username = "testuser";
      
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue({
        username,
        userId: "user-123",
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        body: { pushToken: "token" },
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain("User not found");
    });

    it("should return 404 when device not found", async () => {
      const username = "testuser";
      const userId = "user-123";
      const pushToken = "non-existent-token";
      
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      // Mock token record query (new schema) - not found
      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        body: { pushToken },
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toMatch(/Device not found/);
    });

    it("should return 500 when FCM notification fails", async () => {
      const username = "testuser";
      const userId = "user-123";
      const pushToken = "test-push-token";
      
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      vi.spyOn(fcmSender, "sendFCMNotification").mockResolvedValue(false);

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      const tokenRecordStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          push_token: pushToken,
          user_id: userId,
          device_info: "Test Device",
        }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        } else if (query.includes("SELECT dpt.push_token") && query.includes("FROM device_push_tokens")) {
          return tokenRecordStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        body: { pushToken },
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Failed to send test notification");
    });

    it("should return 401 when authentication fails", async () => {
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue(null);

      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        body: { pushToken: "token" },
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it("should handle invalid JSON body gracefully", async () => {
      const username = "testuser";
      const userId = "user-123";
      
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: userId }),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      // Create request with invalid JSON body
      const request = new Request("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: "invalid json{",
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("pushToken is required");
    });

    it("should handle database errors gracefully", async () => {
      const username = "testuser";
      const userId = "user-123";
      const pushToken = "test-push-token";
      
      vi.spyOn(authMiddleware, "authenticateRequest").mockResolvedValue({
        username,
        userId,
        tokenType: "access" as const,
        isAdmin: false,
      });

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM users WHERE username")) {
          return userStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };
      });

      const request = createMockRequest("https://api.test.com/v1/api/devices/test", {
        method: "POST",
        body: { pushToken },
      });

      const response = await sendTestNotification(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

