import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  sendFCMNotification,
  sendFCMNotificationWithLogs,
  type FCMError,
  type FCMErrorType,
} from "../../src/notifications/fcm-sender";

// classifyFCMError is not exported, so we'll test it indirectly through sendFCMNotificationWithLogs
// or we can test the error classification by examining the error types returned
import { generateGoogleJWT, getGoogleAccessTokenFromJWT } from "../../src/notifications/jwt-helper";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

vi.mock("../../src/notifications/jwt-helper", () => ({
  generateGoogleJWT: vi.fn(),
  getGoogleAccessTokenFromJWT: vi.fn(),
}));

describe("FCM Sender", () => {
  let mockEnv: Env;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockEnv = {
      stockly: {} as any,
      FCM_SERVICE_ACCOUNT: JSON.stringify({
        type: "service_account",
        project_id: "test-project",
        private_key_id: "test-key-id",
        private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
        client_email: "test@test-project.iam.gserviceaccount.com",
        client_id: "123456789",
      }),
    } as Env;

    mockLogger = createMockLogger();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  // Note: classifyFCMError is not exported, so we test error classification
  // indirectly through sendFCMNotificationWithLogs behavior

  describe("sendFCMNotificationWithLogs", () => {
    const validToken = "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const title = "Test Title";
    const body = "Test Body";
    const data = { alertId: "123" };

    beforeEach(() => {
      vi.mocked(generateGoogleJWT).mockResolvedValue("mock-jwt-token");
      vi.mocked(getGoogleAccessTokenFromJWT).mockResolvedValue("mock-access-token");
    });

    it("should reject invalid token format", async () => {
      const result = await sendFCMNotificationWithLogs("short", title, body, data, mockEnv, mockLogger);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("INVALID_ARGUMENT");
      expect(result.shouldCleanupToken).toBe(true);
      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.logs[0]).toContain("Validation failed");
    });

    it("should reject null token", async () => {
      const result = await sendFCMNotificationWithLogs(
        null as any,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("INVALID_ARGUMENT");
    });

    it("should handle missing FCM_SERVICE_ACCOUNT", async () => {
      const envWithoutAccount = { ...mockEnv, FCM_SERVICE_ACCOUNT: undefined } as Env;

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        envWithoutAccount,
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.finalError).toContain("FCM_SERVICE_ACCOUNT");
      expect(result.errorType).toBe("PERMISSION_DENIED");
    });

    it("should handle invalid service account JSON", async () => {
      const envWithInvalidJson = {
        ...mockEnv,
        FCM_SERVICE_ACCOUNT: "invalid json",
      } as Env;

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        envWithInvalidJson,
        mockLogger
      );

      expect(result.success).toBe(false);
    });

    it("should handle JWT generation failure", async () => {
      vi.mocked(generateGoogleJWT).mockRejectedValue(new Error("JWT generation failed"));

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("UNAUTHENTICATED");
    });

    it("should handle access token exchange failure", async () => {
      vi.mocked(getGoogleAccessTokenFromJWT).mockRejectedValue(
        new Error("Token exchange failed")
      );

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("UNAUTHENTICATED");
    });

    it("should send notification successfully", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ name: "projects/test-project/messages/0:1234567890" }),
      } as Response);

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("projects/test-project/messages/0:1234567890");
      expect(result.logs.length).toBeGreaterThan(0);
      // SUCCESS log is not the last one - check that it exists in logs
      const successLog = result.logs.find((log) => log.includes("SUCCESS"));
      expect(successLog).toBeDefined();

      // Verify FCM API was called correctly
      expect(global.fetch).toHaveBeenCalled();
      const call = vi.mocked(global.fetch).mock.calls.find(
        (c) => c[0]?.toString().includes("fcm.googleapis.com")
      );
      expect(call).toBeDefined();
      const requestBody = JSON.parse(call![1]?.body as string);
      expect(requestBody.message.token).toBe(validToken);
      expect(requestBody.message.notification.title).toBe(title);
      expect(requestBody.message.notification.body).toBe(body);
    });

    it("should retry on temporary errors", async () => {
      // First call fails with temporary error
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({
            error: {
              code: 14,
              message: "Service unavailable",
              status: "UNAVAILABLE",
            },
          }),
        } as Response)
        // Second call succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ name: "projects/test-project/messages/0:1234567890" }),
        } as Response);

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Initial + retry
    });

    it("should not retry on permanent errors", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 5,
            message: "Token not found",
            status: "NOT_FOUND",
          },
        }),
      } as Response);

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("NOT_FOUND");
      expect(result.shouldCleanupToken).toBe(true);
      // Should not retry permanent errors
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should log FCM errors", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 3,
            message: "Invalid token",
            status: "INVALID_ARGUMENT",
          },
        }),
      } as Response);

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(false);

      // Check that logger was called with FCM error
      const logs = mockLogger.getLogs();
      const fcmErrorLog = logs.find((log: any) => log.type === "fcm_error");
      expect(fcmErrorLog).toBeDefined();
      expect(fcmErrorLog).toMatchObject({
        fcmErrorCode: "3",
        fcmErrorType: "INVALID_ARGUMENT",
        isPermanent: true,
        shouldCleanupToken: true,
      });
    });

    it('should handle "Permission Denied" error', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 7,
            message: 'Permission denied',
            status: 'PERMISSION_DENIED',
          }
        })
      } as Response);

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('PERMISSION_DENIED');
      expect(result.shouldCleanupToken).toBe(false);
    });

    it('should handle "Resource Exhausted" error', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            code: 8,
            message: 'Quota exceeded',
            status: 'RESOURCE_EXHAUSTED',
          }
        })
      } as Response);

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('RESOURCE_EXHAUSTED');
    });

    it('should handle invalid JSON response from FCM', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Invalid JSON'); }
      } as Response);

      const result = await sendFCMNotificationWithLogs(
        validToken,
        title,
        body,
        data,
        mockEnv,
        mockLogger
      );

      expect(result.success).toBe(false);
      expect(result.finalError).toBe('Internal Server Error');
      // Logic falls back to statusText if JSON parse fails
    });

    it("should convert data values to strings", async () => {
      const dataWithNumbers = {
        alertId: "123",
        price: 100.5,
        threshold: 200,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ name: "projects/test-project/messages/0:1234567890" }),
      } as Response);

      await sendFCMNotificationWithLogs(validToken, title, body, dataWithNumbers, mockEnv, mockLogger);

      const call = vi.mocked(global.fetch).mock.calls.find(
        (c) => c[0]?.toString().includes("fcm.googleapis.com")
      );
      const requestBody = JSON.parse(call![1]?.body as string);
      expect(requestBody.message.data.price).toBe("100.5");
      expect(requestBody.message.data.threshold).toBe("200");
    });
  });

  describe("sendFCMNotification", () => {
    const validToken = "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

    beforeEach(() => {
      vi.mocked(generateGoogleJWT).mockResolvedValue("mock-jwt-token");
      vi.mocked(getGoogleAccessTokenFromJWT).mockResolvedValue("mock-access-token");
    });

    it("should return true on success", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ name: "projects/test-project/messages/0:1234567890" }),
      } as Response);

      const result = await sendFCMNotification(
        validToken,
        "Title",
        "Body",
        {},
        mockEnv,
        mockLogger
      );

      expect(result).toBe(true);
    });

    it("should return false on failure", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 3,
            message: "Invalid token",
            status: "INVALID_ARGUMENT",
          },
        }),
      } as Response);

      const result = await sendFCMNotification(
        validToken,
        "Title",
        "Body",
        {},
        mockEnv,
        mockLogger
      );

      expect(result).toBe(false);
    });
  });
});

