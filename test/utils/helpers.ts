/**
 * Test Helper Functions
 * 
 * Utility functions for common test operations
 */

import { expect } from "vitest";

/**
 * Wait for a specified amount of time (for async operations)
 */
export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that a response has the correct CORS headers
 */
export function expectCORSHeaders(response: Response) {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
  expect(response.headers.get("Access-Control-Allow-Methods")).toBeTruthy();
  expect(response.headers.get("Access-Control-Allow-Headers")).toBeTruthy();
}

/**
 * Assert that a response is a valid JSON response
 */
export async function expectJSONResponse(response: Response) {
  expect(response.headers.get("Content-Type")).toContain("application/json");
  const data = await response.json();
  expect(data).toBeDefined();
  return data;
}

/**
 * Assert that a response is an error response
 */
export async function expectErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedCode?: string
) {
  expect(response.status).toBe(expectedStatus);
  const data = await response.json();
  expect(data.error).toBeDefined();
  if (expectedCode) {
    expect(data.error.code).toBe(expectedCode);
  }
  return data;
}

/**
 * Create a test execution context
 */
export function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

/**
 * Assert that a database query was called with specific parameters
 */
export function expectDatabaseQuery(
  mockPrepare: ReturnType<typeof vi.fn>,
  expectedQuery: string | RegExp,
  times: number = 1
) {
  const calls = mockPrepare.mock.calls.filter((call) => {
    const query = call[0];
    if (typeof expectedQuery === "string") {
      return query.includes(expectedQuery);
    }
    return expectedQuery.test(query);
  });
  expect(calls.length).toBeGreaterThanOrEqual(times);
}

/**
 * Create a mock D1 result row
 */
export function createD1ResultRow(data: Record<string, any>) {
  return {
    results: [data],
    success: true,
    meta: {
      duration: 1,
      size_after: 0,
      rows_read: 1,
      rows_written: 0,
    },
  };
}

/**
 * Create a mock D1 result with multiple rows
 */
export function createD1ResultRows(rows: Record<string, any>[]) {
  return {
    results: rows,
    success: true,
    meta: {
      duration: 1,
      size_after: 0,
      rows_read: rows.length,
      rows_written: 0,
    },
  };
}

import { vi } from "vitest";


