import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleAlertsRequest } from "../src/api/alerts";
import {
  listAlerts,
  createAlert,
  getAlert,
  updateAlert,
  deleteAlert,
} from "../src/alerts/storage";
import { deleteAlertState } from "../src/alerts/state";
import { createMockLogger } from "./test-utils";

vi.mock("../src/alerts/storage", () => ({
  listAlerts: vi.fn(),
  createAlert: vi.fn(),
  getAlert: vi.fn(),
  updateAlert: vi.fn(),
  deleteAlert: vi.fn(),
}));

vi.mock("../src/alerts/state", () => ({
  deleteAlertState: vi.fn(),
}));

const createRequest = (init?: RequestInit & { path?: string }) => {
  const url = new URL(init?.path ?? "/v1/api/alerts", "https://example.com");
  url.searchParams.set("ts", Date.now().toString());
  return new Request(url, init);
};

const env = { stockly: {} as any, alertsKv: { delete: vi.fn() } as any };

describe("alerts handler", () => {
  beforeEach(() => {
    vi.mocked(listAlerts).mockReset();
    vi.mocked(createAlert).mockReset();
    vi.mocked(getAlert).mockReset();
    vi.mocked(updateAlert).mockReset();
    vi.mocked(deleteAlert).mockReset();
    vi.mocked(deleteAlertState).mockReset();
  });

  it("lists alerts", async () => {
    vi.mocked(listAlerts).mockResolvedValue([{ id: "1" } as any]);
    const response = await handleAlertsRequest(createRequest({ method: "GET" }), env as any, createMockLogger());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ alerts: [{ id: "1" }] });
  });

  it("creates an alert when payload is valid", async () => {
    const created = { id: "2" } as any;
    vi.mocked(createAlert).mockResolvedValue(created);
    const body = {
      symbol: "aapl",
      direction: "above",
      threshold: 200,
      channel: "notification",
      target: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    };

    const response = await handleAlertsRequest(
      createRequest({ method: "POST", body: JSON.stringify(body) }),
      env as any,
      createMockLogger()
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(created);
    expect(createAlert).toHaveBeenCalled();
  });

  it("returns 404 when an alert is missing", async () => {
    vi.mocked(getAlert).mockResolvedValue(null);
    const response = await handleAlertsRequest(
      createRequest({ method: "GET", path: "/v1/api/alerts/missing" }),
      env as any,
      createMockLogger()
    );
    expect(response.status).toBe(404);
  });

  it("updates alerts via PUT", async () => {
    const updated = { id: "3", status: "active" } as any;
    vi.mocked(updateAlert).mockResolvedValue(updated);
    const response = await handleAlertsRequest(
      createRequest({
        method: "PUT",
        path: "/v1/api/alerts/3",
        body: JSON.stringify({ status: "paused" }),
      }),
      env as any,
      createMockLogger()
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(updated);
  });

  it("deletes alerts and clears KV state", async () => {
    vi.mocked(deleteAlert).mockResolvedValue(true);
    const response = await handleAlertsRequest(
      createRequest({ method: "DELETE", path: "/v1/api/alerts/123" }),
      env as any,
      createMockLogger()
    );
    expect(response.status).toBe(200);
    expect(deleteAlertState).toHaveBeenCalledWith(env.alertsKv, "123");
  });
});
