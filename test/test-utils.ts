/**
 * Test utilities for logging
 */

import { Logger } from "../src/logging/logger";

/**
 * Create a mock logger for testing
 * All methods are no-ops, but you can spy on them if needed
 */
export function createMockLogger(): Logger {
  return new Logger({
    traceId: "test-trace-id",
    userId: null,
    path: "/test",
    service: "stockly-api-test",
  });
}

// Re-export utilities from utils directory
export * from "./utils/factories";
export * from "./utils/mocks";
export * from "./utils/helpers";
export * from "./utils/test-env";



