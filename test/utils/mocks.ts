/**
 * Mock Services and Helpers
 * 
 * Reusable mocks for external services and dependencies
 */

import { vi } from "vitest";

/**
 * Mock FCM notification sender
 */
export function createMockFCMSender() {
  return {
    sendFCMNotification: vi.fn().mockResolvedValue({ success: true }),
    sendFCMNotificationToMultiple: vi.fn().mockResolvedValue({ success: true, results: [] }),
  };
}

/**
 * Mock external stock API (FMP)
 */
export function createMockStockAPI() {
  return {
    getStockQuote: vi.fn(),
    getStockQuotes: vi.fn(),
    searchStock: vi.fn(),
    getStockDetails: vi.fn(),
    getHistoricalPrices: vi.fn(),
    getIntradayPrices: vi.fn(),
    getStockNews: vi.fn(),
  };
}

/**
 * Mock authentication middleware
 */
export function createMockAuth() {
  return {
    authenticateRequest: vi.fn().mockResolvedValue({
      username: "testuser",
      userId: "user-123",
      tokenType: "access" as const,
      isAdmin: false,
    }),
    authenticateRequestWithAdmin: vi.fn().mockResolvedValue({
      username: "testuser",
      userId: "user-123",
      tokenType: "access" as const,
      isAdmin: false,
    }),
  };
}

/**
 * Mock cache service
 */
export function createMockCache() {
  const cache = new Map<string, { value: any; expires: number }>();
  
  return {
    get: vi.fn((key: string) => {
      const item = cache.get(key);
      if (item && item.expires > Date.now()) {
        return item.value;
      }
      cache.delete(key);
      return null;
    }),
    set: vi.fn((key: string, value: any, ttl: number = 3600) => {
      cache.set(key, {
        value,
        expires: Date.now() + ttl * 1000,
      });
    }),
    delete: vi.fn((key: string) => {
      cache.delete(key);
    }),
    clear: vi.fn(() => {
      cache.clear();
    }),
  };
}

/**
 * Mock logger with spyable methods
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    getLogs: vi.fn().mockReturnValue([]),
  };
}

/**
 * Setup common mocks for API tests
 */
export function setupCommonMocks() {
  vi.mock("../src/notifications/fcm-sender", () => ({
    sendFCMNotification: vi.fn().mockResolvedValue(true),
    sendFCMNotificationToMultiple: vi.fn().mockResolvedValue({ success: true, results: [] }),
  }));

  vi.mock("../src/auth/middleware", () => ({
    authenticateRequest: vi.fn().mockResolvedValue({
      username: "testuser",
      userId: "user-123",
      tokenType: "access" as const,
      isAdmin: false,
    }),
    authenticateRequestWithAdmin: vi.fn().mockResolvedValue({
      username: "testuser",
      userId: "user-123",
      tokenType: "access" as const,
      isAdmin: false,
    }),
  }));

  vi.mock("../src/alerts/storage", () => ({
    listAlerts: vi.fn(),
    createAlert: vi.fn(),
    getAlert: vi.fn(),
    updateAlert: vi.fn(),
    deleteAlert: vi.fn(),
  }));

  vi.mock("../src/alerts/state", () => ({
    deleteAlertState: vi.fn(),
    getAlertState: vi.fn(),
    setAlertState: vi.fn(),
  }));
}


