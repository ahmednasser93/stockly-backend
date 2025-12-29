import { describe, it, expect, beforeEach, vi } from "vitest";
import { AlertController } from "../src/controllers/alerts.controller";
import { createAlertService } from "../src/factories/createAlertService";
import { createMockLogger } from "./test-utils";

vi.mock("../src/factories/createAlertService", () => ({
  createAlertService: vi.fn(),
}));

vi.mock("../src/auth/middleware", () => ({
  authenticateRequestWithAdmin: vi.fn().mockResolvedValue({
    username: "testuser",
    tokenType: "access" as const,
    isAdmin: false,
  }),
}));

const createRequest = (init?: RequestInit & { path?: string }) => {
  const url = new URL(init?.path ?? "/v1/api/alerts", "https://example.com");
  url.searchParams.set("ts", Date.now().toString());
  return new Request(url, init);
};

const env = { stockly: {} as any, alertsKv: { delete: vi.fn() } as any, JWT_SECRET: "test-secret", JWT_REFRESH_SECRET: "test-refresh-secret" };

describe("alerts handler", () => {
  let mockService: any;
  let controller: AlertController;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    mockService = {
      listAlerts: vi.fn(),
      createAlert: vi.fn(),
      getAlert: vi.fn(),
      updateAlert: vi.fn(),
      deleteAlert: vi.fn(),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);
    controller = new AlertController(mockService, logger, env as any);
  });

  it("lists alerts", async () => {
    const mockAlert = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      status: "active" as const,
      channel: "notification" as const,
      notes: null,
      username: "testuser",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    vi.mocked(mockService.listAlerts).mockResolvedValue([mockAlert]);
    const response = await controller.listAlerts(createRequest({ method: "GET" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0].id).toBe(mockAlert.id);
    expect(mockService.listAlerts).toHaveBeenCalledWith("testuser");
  });

  it("creates an alert when payload is valid", async () => {
    const created = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      status: "active" as const,
      channel: "notification" as const,
      notes: null,
      username: "testuser",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    vi.mocked(mockService.createAlert).mockResolvedValue(created);
    const body = {
      symbol: "aapl",
      direction: "above",
      threshold: 200,
      channel: "notification",
    };

    const response = await controller.createAlert(
      createRequest({ 
        method: "POST", 
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      })
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.alert.id).toBe(created.id);
    expect(mockService.createAlert).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "aapl", direction: "above", threshold: 200, channel: "notification" }), 
      "testuser"
    );
  });

  it("returns 404 when an alert is missing", async () => {
    vi.mocked(mockService.getAlert).mockResolvedValue(null);
    const response = await controller.getAlert(
      createRequest({ method: "GET", path: "/v1/api/alerts/missing" }),
      "missing"
    );
    expect(response.status).toBe(404);
    expect(mockService.getAlert).toHaveBeenCalledWith("missing", "testuser");
  });

  it("updates alerts via PUT", async () => {
    const updated = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      status: "paused" as const,
      channel: "notification" as const,
      notes: null,
      username: "testuser",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };
    vi.mocked(mockService.updateAlert).mockResolvedValue(updated);
    const response = await controller.updateAlert(
      createRequest({
        method: "PUT",
        path: "/v1/api/alerts/550e8400-e29b-41d4-a716-446655440002",
        body: JSON.stringify({ status: "paused" }),
        headers: { "Content-Type": "application/json" }
      }),
      "550e8400-e29b-41d4-a716-446655440002"
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.alert.id).toBe(updated.id);
    expect(data.alert.status).toBe("paused");
    expect(mockService.updateAlert).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440002", expect.objectContaining({ status: "paused" }), "testuser");
  });

  it("deletes alerts", async () => {
    vi.mocked(mockService.deleteAlert).mockResolvedValue(undefined);
    const response = await controller.deleteAlert(
      createRequest({ method: "DELETE", path: "/v1/api/alerts/123" }),
      "123"
    );
    expect(response.status).toBe(200);
    expect(mockService.deleteAlert).toHaveBeenCalledWith("123", "testuser");
  });
});
