import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAllUsers, getUserByUsername, getUserDevices, getUserAlerts, getUserFavoriteStocks } from "../../src/api/users";
import { authenticateRequestWithAdmin } from "../../src/auth/middleware";
import { createMockD1Database } from "../test-utils";
import { listAlerts } from "../../src/alerts/storage";

vi.mock("../../src/auth/middleware");
vi.mock("../../src/alerts/storage");

describe("Users API", () => {
  let mockEnv: any;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
      username: "admin",
      tokenType: "access" as const,
      isAdmin: true,
    } as any);

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    const { mockDb } = createMockD1Database();
    mockEnv = {
      stockly: mockDb as unknown as D1Database,
      JWT_SECRET: "test-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
    };
  });

  describe("getAllUsers", () => {
    it("should return all users with activity status for admin", async () => {
      const mockUsers = [
        { user_id: "u1", username: "alice" },
        { user_id: "u2", username: "bob" },
        { user_id: "u3", username: "charlie" },
      ];

      const mockFavoriteStocksRows = [
        { user_id: "u1", symbol: "AAPL" },
        { user_id: "u1", symbol: "TSLA" },
        { user_id: "u2", symbol: "MSFT" },
      ];

      const mockDevicesCounts = [
        { user_id: "u2", count: 1 },
        { user_id: "u3", count: 2 },
      ];

      const mockAlertsCounts = [
        { username: "alice", total_count: 3, active_count: 2 },
        { username: "bob", total_count: 1, active_count: 1 },
      ];

      const allUsersStmt = {
        all: vi.fn().mockResolvedValue({ results: mockUsers }),
      };

      const favoriteStocksStmt = {
        all: vi.fn().mockResolvedValue({ results: mockFavoriteStocksRows }),
      };

      const devicesStmt = {
        all: vi.fn().mockResolvedValue({ results: mockDevicesCounts }),
      };

      const alertsStmt = {
        all: vi.fn().mockResolvedValue({ results: mockAlertsCounts }),
      };

      mockEnv.stockly.prepare
        .mockReturnValueOnce(allUsersStmt)
        .mockReturnValueOnce(favoriteStocksStmt)
        .mockReturnValueOnce(devicesStmt)
        .mockReturnValueOnce(alertsStmt);

      const request = new Request("https://example.com/v1/api/users/all");
      const response = await getAllUsers(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.users).toHaveLength(3);

      // Check Alice (has stocks and alerts, no devices)
      const alice = data.users.find((u: any) => u.username === "alice");
      expect(alice).toBeDefined();
      expect(alice.hasFavoriteStocks).toBe(true);
      expect(alice.favoriteStocksCount).toBe(2);
      expect(alice.favoriteStocks).toEqual(["AAPL", "TSLA"]);
      expect(alice.hasDevices).toBe(false);
      expect(alice.devicesCount).toBe(0);
      expect(alice.hasAlerts).toBe(true);
      expect(alice.alertsCount).toBe(3);
      expect(alice.activeAlertsCount).toBe(2);

      // Check Bob (has stocks, devices, and alerts)
      const bob = data.users.find((u: any) => u.username === "bob");
      expect(bob).toBeDefined();
      expect(bob.hasFavoriteStocks).toBe(true);
      expect(bob.favoriteStocksCount).toBe(1);
      expect(bob.favoriteStocks).toEqual(["MSFT"]);
      expect(bob.hasDevices).toBe(true);
      expect(bob.devicesCount).toBe(1);
      expect(bob.hasAlerts).toBe(true);
      expect(bob.alertsCount).toBe(1);

      // Check Charlie (has devices only, no stocks or alerts)
      const charlie = data.users.find((u: any) => u.username === "charlie");
      expect(charlie).toBeDefined();
      expect(charlie.hasFavoriteStocks).toBe(false);
      expect(charlie.favoriteStocksCount).toBe(0);
      expect(charlie.hasDevices).toBe(true);
      expect(charlie.devicesCount).toBe(2);
      expect(charlie.hasAlerts).toBe(false);
      expect(charlie.alertsCount).toBe(0);
    });

    it("should deny non-admin access", async () => {
      vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
        username: "user",
        tokenType: "access" as const,
        isAdmin: false,
      } as any);

      const request = new Request("https://example.com/v1/api/users/all");
      const response = await getAllUsers(request, mockEnv, mockLogger);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("Admin access required");
    });

    it("should return empty array when no users exist", async () => {
      const allUsersStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      const favoriteStocksStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      const devicesStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      const alertsStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      mockEnv.stockly.prepare
        .mockReturnValueOnce(allUsersStmt)
        .mockReturnValueOnce(favoriteStocksStmt)
        .mockReturnValueOnce(devicesStmt)
        .mockReturnValueOnce(alertsStmt);

      const request = new Request("https://example.com/v1/api/users/all");
      const response = await getAllUsers(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.users).toHaveLength(0);
    });

    it("should return users with no activity", async () => {
      const mockUsers = [
        { user_id: "u1", username: "inactive_user" },
      ];

      const allUsersStmt = {
        all: vi.fn().mockResolvedValue({ results: mockUsers }),
      };

      const favoriteStocksStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      const devicesStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      const alertsStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };

      mockEnv.stockly.prepare
        .mockReturnValueOnce(allUsersStmt)
        .mockReturnValueOnce(favoriteStocksStmt)
        .mockReturnValueOnce(devicesStmt)
        .mockReturnValueOnce(alertsStmt);

      const request = new Request("https://example.com/v1/api/users/all");
      const response = await getAllUsers(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.users).toHaveLength(1);
      
      const user = data.users[0];
      expect(user.username).toBe("inactive_user");
      expect(user.hasFavoriteStocks).toBe(false);
      expect(user.favoriteStocks).toEqual([]);
      expect(user.hasDevices).toBe(false);
      expect(user.hasAlerts).toBe(false);
    });
  });

  describe("getUserByUsername", () => {
    it("should return user details for admin", async () => {
      const mockUser = {
        user_id: "u1",
        username: "alice",
        email: "alice@example.com",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      };

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser),
      };

      mockEnv.stockly.prepare.mockReturnValueOnce(userStmt);

      const request = new Request("https://example.com/v1/api/users/alice");
      const response = await getUserByUsername(request, "alice", mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.userId).toBe("u1");
      expect(data.username).toBe("alice");
      expect(data.email).toBe("alice@example.com");
    });

    it("should return 404 if user not found", async () => {
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockEnv.stockly.prepare.mockReturnValueOnce(userStmt);

      const request = new Request("https://example.com/v1/api/users/nonexistent");
      const response = await getUserByUsername(request, "nonexistent", mockEnv, mockLogger);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("User not found");
    });

    it("should deny non-admin access", async () => {
      vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
        username: "user",
        tokenType: "access" as const,
        isAdmin: false,
      } as any);

      const request = new Request("https://example.com/v1/api/users/alice");
      const response = await getUserByUsername(request, "alice", mockEnv, mockLogger);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("Admin access required");
    });
  });

  describe("getUserDevices", () => {
    it("should return devices for a user", async () => {
      const mockUser = { id: "u1" };
      const mockDevices = [
        {
          user_id: "u1",
          push_token: "token1",
          device_info: "Android Device",
          device_type: "android",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          username: "alice",
        },
      ];

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser),
      };

      const devicesStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockDevices }),
      };

      const alertCountStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn()
          .mockResolvedValueOnce({ count: 5 })
          .mockResolvedValueOnce({ count: 3 }),
      };

      mockEnv.stockly.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(devicesStmt)
        .mockReturnValue(alertCountStmt);

      const request = new Request("https://example.com/v1/api/users/alice/devices");
      const response = await getUserDevices(request, "alice", mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.devices).toHaveLength(1);
      expect(data.devices[0].pushToken).toBe("token1");
      expect(data.devices[0].username).toBe("alice");
    });

    it("should return 404 if user not found", async () => {
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockEnv.stockly.prepare.mockReturnValueOnce(userStmt);

      const request = new Request("https://example.com/v1/api/users/nonexistent/devices");
      const response = await getUserDevices(request, "nonexistent", mockEnv, mockLogger);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("User not found");
    });
  });

  describe("getUserAlerts", () => {
    it("should return alerts for a user", async () => {
      const mockUser = { id: "u1" };
      const mockAlerts = [
        {
          id: "a1",
          symbol: "AAPL",
          direction: "above" as const,
          threshold: 150,
          status: "active" as const,
          channel: "push" as const,
          notes: null,
          username: "alice",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ];

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser),
      };

      vi.mocked(listAlerts).mockResolvedValue(mockAlerts as any);

      mockEnv.stockly.prepare.mockReturnValueOnce(userStmt);

      const request = new Request("https://example.com/v1/api/users/alice/alerts");
      const response = await getUserAlerts(request, "alice", mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.alerts).toHaveLength(1);
      expect(data.alerts[0].symbol).toBe("AAPL");
      expect(listAlerts).toHaveBeenCalledWith(mockEnv, "alice");
    });

    it("should return 404 if user not found", async () => {
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockEnv.stockly.prepare.mockReturnValueOnce(userStmt);

      const request = new Request("https://example.com/v1/api/users/nonexistent/alerts");
      const response = await getUserAlerts(request, "nonexistent", mockEnv, mockLogger);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("User not found");
    });
  });

  describe("getUserFavoriteStocks", () => {
    it("should return favorite stocks for a user", async () => {
      const mockUser = { id: "u1" };
      const mockStocks = [
        {
          symbol: "AAPL",
          display_order: 0,
          created_at: 1704067200, // 2024-01-01
          updated_at: 1704153600, // 2024-01-02
        },
        {
          symbol: "TSLA",
          display_order: 1,
          created_at: 1704067200,
          updated_at: 1704153600,
        },
      ];

      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockUser),
      };

      const stocksStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockStocks }),
      };

      mockEnv.stockly.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(stocksStmt);

      const request = new Request("https://example.com/v1/api/users/alice/favorite-stocks");
      const response = await getUserFavoriteStocks(request, "alice", mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.stocks).toHaveLength(2);
      expect(data.stocks[0].symbol).toBe("AAPL");
      expect(data.stocks[1].symbol).toBe("TSLA");
    });

    it("should return 404 if user not found", async () => {
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockEnv.stockly.prepare.mockReturnValueOnce(userStmt);

      const request = new Request("https://example.com/v1/api/users/nonexistent/favorite-stocks");
      const response = await getUserFavoriteStocks(request, "nonexistent", mockEnv, mockLogger);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("User not found");
    });
  });
});
