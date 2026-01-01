/**
 * Tests for Senate Trading Controller
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SenateTradingController } from "../../src/controllers/senate-trading.controller";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

describe("Senate Trading Controller", () => {
  let env: Env;
  let controller: SenateTradingController;

  beforeEach(() => {
    vi.restoreAllMocks();
    env = {
      stockly: {
        prepare: vi.fn(),
      } as any,
      JWT_SECRET: "test-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
    } as Env;
    const logger = createMockLogger();
    controller = new SenateTradingController(env, logger);
  });

  it("should handle GET /v1/api/senate-trading/feed", async () => {
    const mockRequest = new Request("https://example.com/v1/api/senate-trading/feed", {
      headers: { "Origin": "http://localhost:5173" }
    });
    
    // Mock the API handler
    const senateTradingApi = await import("../../src/api/senate-trading-api");
    vi.spyOn(senateTradingApi, "getSenateTradingFeed").mockResolvedValue(
      new Response(JSON.stringify({ trades: [] }), { status: 200 })
    );

    const response = await controller.handleRequest(mockRequest);

    expect(response.status).toBe(200);
  });

  it("should handle GET /v1/api/senate-trading/senators", async () => {
    const mockRequest = new Request("https://example.com/v1/api/senate-trading/senators", {
      headers: { "Origin": "http://localhost:5173" }
    });
    
    const senateTradingApi = await import("../../src/api/senate-trading-api");
    vi.spyOn(senateTradingApi, "getSenatorsList").mockResolvedValue(
      new Response(JSON.stringify({ senators: [] }), { status: 200 })
    );

    const response = await controller.handleRequest(mockRequest);

    expect(response.status).toBe(200);
  });

  it("should handle GET /v1/api/senate-trading/senators/popular", async () => {
    const mockRequest = new Request("https://example.com/v1/api/senate-trading/senators/popular?type=trades&limit=10", {
      headers: { "Origin": "http://localhost:5173" }
    });
    
    const senateTradingApi = await import("../../src/api/senate-trading-api");
    vi.spyOn(senateTradingApi, "getPopularSenators").mockResolvedValue(
      new Response(JSON.stringify({ senators: [] }), { status: 200 })
    );

    const response = await controller.handleRequest(mockRequest);

    expect(response.status).toBe(200);
  });

  it("should handle GET /v1/api/senate-trading/senators/autocomplete", async () => {
    const mockRequest = new Request("https://example.com/v1/api/senate-trading/senators/autocomplete?query=John", {
      headers: { "Origin": "http://localhost:5173" }
    });
    
    const senateTradingApi = await import("../../src/api/senate-trading-api");
    vi.spyOn(senateTradingApi, "searchSenatorsAutocomplete").mockResolvedValue(
      new Response(JSON.stringify({ senators: [] }), { status: 200 })
    );

    const response = await controller.handleRequest(mockRequest);

    expect(response.status).toBe(200);
  });

  it("should return 404 for unknown routes", async () => {
    const mockRequest = new Request("https://example.com/v1/api/senate-trading/unknown", {
      headers: { "Origin": "http://localhost:5173" }
    });
    
    const response = await controller.handleRequest(mockRequest);

    expect(response.status).toBe(404);
  });
});

