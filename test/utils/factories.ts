/**
 * Test Data Factories
 * 
 * Factories for creating test data objects used across API tests
 */

import type { Env } from "../../src/index";

/**
 * Create a mock D1Database for testing
 */
export function createMockD1Database() {
  const mockDb = {
    prepare: vi.fn(),
  };

  // Helper to create a prepared statement mock
  const createPreparedStatement = (query: string) => {
    const stmt = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
    mockDb.prepare.mockReturnValue(stmt);
    return stmt;
  };

  return { mockDb, createPreparedStatement };
}

/**
 * Create a mock KV namespace for testing
 */
export function createMockKVNamespace() {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
}

/**
 * Create a mock Env object for testing
 */
export function createMockEnv(overrides: Partial<Env> = {}): Env {
  const { mockDb } = createMockD1Database();
  
  return {
    stockly: mockDb as unknown as D1Database,
    alertsKv: createMockKVNamespace() as unknown as KVNamespace,
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
    FMP_API_KEY: "test-api-key",
    LOKI_URL: "https://logs.test.com",
    LOKI_USERNAME: "test-user",
    LOKI_PASSWORD: "test-password",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    JWT_SECRET: "test-jwt-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    ...overrides,
  };
}

/**
 * Create a mock Request object for testing
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: HeadersInit;
    body?: any;
  } = {}
): Request {
  const { method = "GET", headers = {}, body } = options;
  
  // Ensure URL is absolute
  const absoluteUrl = url.startsWith('http') ? url : `https://example.com${url.startsWith('/') ? url : `/${url}`}`;
  
  return new Request(absoluteUrl, {
    method,
    headers: {
      "Origin": "http://localhost:5173", // Add Origin header for client authentication in tests
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Create mock stock quote data
 */
export function createMockStockQuote(symbol: string, overrides: any = {}) {
  return {
    symbol,
    name: `${symbol} Inc.`,
    price: 100.0,
    change: 1.5,
    changePercent: 1.5,
    volume: 1000000,
    marketCap: 1000000000,
    pe: 25.0,
    eps: 4.0,
    dividend: 2.0,
    yield: 2.0,
    ...overrides,
  };
}

/**
 * Create mock user data
 */
export function createMockUser(overrides: any = {}) {
  return {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    username: "testuser",
    picture: "https://example.com/picture.jpg",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock alert data
 */
export function createMockAlert(overrides: any = {}) {
  return {
    id: "alert-123",
    username: "testuser",
    symbol: "AAPL",
    direction: "above",
    threshold: 150.0,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock device/push token data
 */
export function createMockDevice(overrides: any = {}) {
  return {
    user_id: "user-123",
    username: "testuser",
    push_token: "test-push-token-123",
    device_info: "Test Device",
    device_type: "android",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock news article data
 */
export function createMockNewsArticle(overrides: any = {}) {
  return {
    title: "Test News Article",
    url: "https://example.com/news/1",
    publishedDate: new Date().toISOString(),
    source: "Test Source",
    symbol: "AAPL",
    text: "Test article content",
    image: "https://example.com/image.jpg",
    ...overrides,
  };
}

// Import vi from vitest
import { vi } from "vitest";

/**
 * Create a test environment (alias for createMockEnv for compatibility)
 */
export function createTestEnv(overrides: Partial<Env> = {}): Env {
  return createMockEnv(overrides);
}

/**
 * Create a test request
 */
export function createTestRequest(
  url: string,
  method: string = "GET",
  body?: any
): Request {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  
  if (body) {
    init.body = JSON.stringify(body);
  }
  
  return new Request(url, {
    ...init,
    headers: {
      "Origin": "http://localhost:5173", // Add Origin header for client authentication in tests
      ...init?.headers,
    }
  });
}

