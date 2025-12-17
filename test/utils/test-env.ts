/**
 * Test Environment Configuration
 * 
 * Configuration for different test environments
 */

export const TEST_ENV = {
  // API Configuration
  API_BASE_URL: process.env.API_BASE_URL || "http://localhost:8787",
  API_KEY: process.env.API_KEY || "test-api-key",
  
  // Database Configuration
  DB_NAME: process.env.DB_NAME || "stockly-test",
  
  // Authentication
  JWT_SECRET: process.env.JWT_SECRET || "test-jwt-secret",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "test-refresh-secret",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "test-client-id",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "test-client-secret",
  
  // External Services
  FMP_API_KEY: process.env.FMP_API_KEY || "test-fmp-api-key",
  FCM_SERVICE_ACCOUNT: process.env.FCM_SERVICE_ACCOUNT || JSON.stringify({
    type: "service_account",
    project_id: "test-project",
  }),
  
  // Logging
  LOKI_URL: process.env.LOKI_URL || "https://logs.test.com",
  LOKI_USERNAME: process.env.LOKI_USERNAME || "test-user",
  LOKI_PASSWORD: process.env.LOKI_PASSWORD || "test-password",
  
  // Test Data
  TEST_USERNAME: process.env.TEST_USERNAME || "testuser",
  TEST_USER_ID: process.env.TEST_USER_ID || "user-123",
  TEST_SYMBOL: process.env.TEST_SYMBOL || "AAPL",
};

/**
 * Reset test environment variables
 */
export function resetTestEnv() {
  // Clear any cached values
  Object.keys(TEST_ENV).forEach((key) => {
    delete (TEST_ENV as any)[key];
  });
}

/**
 * Get test environment variable with fallback
 */
export function getTestEnv(key: keyof typeof TEST_ENV, fallback?: string): string {
  return TEST_ENV[key] || fallback || "";
}



