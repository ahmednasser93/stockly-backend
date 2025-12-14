import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/api/get-stock", () => ({
  getStock: vi.fn(),
}));

vi.mock("../src/api/search-stock", () => ({
  searchStock: vi.fn(),
}));

vi.mock("../src/api/get-stocks", () => ({
  getStocks: vi.fn(),
}));

import worker from "../src/index";
import { getStock } from "../src/api/get-stock";
import { searchStock } from "../src/api/search-stock";
import { getStocks } from "../src/api/get-stocks";
import type { Env } from "../src/index";

const makeRequest = (path: string) =>
  new Request(`https://example.com${path}`, { method: "GET" });

const createMockEnv = (): Env => ({
  stockly: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue(undefined),
      }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as D1Database,
  alertsKv: undefined,
});

const createMockCtx = (): ExecutionContext => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} as unknown as ExecutionContext);

describe("worker router", () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockCtx = createMockCtx();
    vi.mocked(getStock).mockReset();
    vi.mocked(searchStock).mockReset();
    vi.mocked(getStocks).mockReset();
  });

  it("returns the health check", async () => {
    const response = await worker.fetch(makeRequest("/v1/api/health"), mockEnv, mockCtx);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("delegates /get-stock requests", async () => {
    const mockedResponse = new Response("stock-response");
    vi.mocked(getStock).mockResolvedValue(mockedResponse);

    const response = await worker.fetch(
      makeRequest("/v1/api/get-stock?symbol=MSFT"),
      mockEnv,
      mockCtx
    );

    expect(getStock).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(getStock).mock.calls[0];
    expect(callArgs[0]).toBeInstanceOf(Request);
    expect(callArgs[1]).toBeInstanceOf(URL);
    expect(callArgs[1].toString()).toBe(
      "https://example.com/v1/api/get-stock?symbol=MSFT",
    );
    expect(response).toBe(mockedResponse);
  });

  it("delegates /search-stock requests", async () => {
    const mockedResponse = new Response("search-response");
    vi.mocked(searchStock).mockResolvedValue(mockedResponse);

    const response = await worker.fetch(
      makeRequest("/v1/api/search-stock?query=MSFT"),
      mockEnv,
      mockCtx
    );

    expect(searchStock).toHaveBeenCalled();
    expect(response).toBe(mockedResponse);
  });

  it("delegates /get-stocks requests", async () => {
    const mockedResponse = new Response("multi-response");
    vi.mocked(getStocks).mockResolvedValue(mockedResponse);

    const response = await worker.fetch(
      makeRequest("/v1/api/get-stocks?symbols=MSFT,AMZN"),
      mockEnv,
      mockCtx
    );

    expect(getStocks).toHaveBeenCalledTimes(1);
    expect(response).toBe(mockedResponse);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await worker.fetch(makeRequest("/v1/api/unknown"), mockEnv, mockCtx);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("responds to CORS preflight requests", async () => {
    const request = new Request("https://example.com/v1/api/get-stock", {
      method: "OPTIONS",
    });

    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET",
    );
  });
});
