import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateGoogleJWT,
  getGoogleAccessTokenFromJWT,
} from "../../src/notifications/jwt-helper";

describe("JWT Helper", () => {
  beforeEach(() => {
    // Mock crypto.subtle
    global.crypto = {
      subtle: {
        importKey: vi.fn().mockResolvedValue({} as CryptoKey),
        sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5])),
      } as unknown as SubtleCrypto,
      getRandomValues: vi.fn(),
    } as Crypto;
    global.fetch = vi.fn();
  });

  describe("generateGoogleJWT", () => {
    // Use valid base64-encoded key (minimal valid PKCS8 key)
    const serviceAccount = {
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----\n",
      client_email: "test@test-project.iam.gserviceaccount.com",
      project_id: "test-project",
    };

    it("should generate JWT with correct structure", async () => {
      const jwt = await generateGoogleJWT(serviceAccount);

      expect(jwt).toBeDefined();
      expect(typeof jwt).toBe("string");
      
      // JWT should have 3 parts separated by dots
      const parts = jwt.split(".");
      expect(parts).toHaveLength(3);
    });

    it("should include correct header", async () => {
      const jwt = await generateGoogleJWT(serviceAccount);
      const parts = jwt.split(".");
      
      // Decode header (base64url to base64, add padding if needed)
      let base64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
      // Add padding if needed
      while (base64.length % 4) {
        base64 += "=";
      }
      const headerJson = atob(base64);
      const header = JSON.parse(headerJson);
      
      expect(header).toMatchObject({
        alg: "RS256",
        typ: "JWT",
      });
    });

    it("should include correct payload", async () => {
      const jwt = await generateGoogleJWT(serviceAccount);
      const parts = jwt.split(".");
      
      // Decode payload (base64url to base64, add padding if needed)
      let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      // Add padding if needed
      while (base64.length % 4) {
        base64 += "=";
      }
      const payloadJson = atob(base64);
      const payload = JSON.parse(payloadJson);
      
      expect(payload.iss).toBe(serviceAccount.client_email);
      expect(payload.sub).toBe(serviceAccount.client_email);
      expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
      expect(payload.scope).toBe("https://www.googleapis.com/auth/firebase.messaging");
      expect(payload).toHaveProperty("iat");
      expect(payload).toHaveProperty("exp");
      expect(payload.exp - payload.iat).toBe(3600); // 1 hour
    });

    it("should use custom scope", async () => {
      const customScope = "https://www.googleapis.com/auth/cloud-platform";
      const jwt = await generateGoogleJWT(serviceAccount, customScope);
      const parts = jwt.split(".");
      
      // Decode payload (base64url to base64, add padding if needed)
      let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      // Add padding if needed
      while (base64.length % 4) {
        base64 += "=";
      }
      const payloadJson = atob(base64);
      const payload = JSON.parse(payloadJson);
      
      expect(payload.scope).toBe(customScope);
    });

    it("should handle PEM key parsing", async () => {
      const jwt = await generateGoogleJWT(serviceAccount);
      
      // Should call importKey with pkcs8 format
      expect(global.crypto.subtle.importKey).toHaveBeenCalled();
      const importCall = vi.mocked(global.crypto.subtle.importKey).mock.calls[0];
      // First parameter is the format ("pkcs8")
      expect(importCall[0]).toBe("pkcs8");
      // Second parameter is the key buffer (ArrayBuffer)
      expect(importCall[1]).toBeInstanceOf(ArrayBuffer);
    });

    it("should sign with RSASSA-PKCS1-v1_5", async () => {
      await generateGoogleJWT(serviceAccount);
      
      expect(global.crypto.subtle.sign).toHaveBeenCalled();
      const signCall = vi.mocked(global.crypto.subtle.sign).mock.calls[0];
      expect(signCall[0]).toBe("RSASSA-PKCS1-v1_5");
    });
  });

  describe("getGoogleAccessTokenFromJWT", () => {
    const mockJWT = "mock.jwt.token";

    it("should exchange JWT for access token", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "mock-access-token" }),
      } as Response);

      const token = await getGoogleAccessTokenFromJWT(mockJWT);

      expect(token).toBe("mock-access-token");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
      );

      const call = vi.mocked(global.fetch).mock.calls[0];
      const body = call[1]?.body as URLSearchParams;
      expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      expect(body.get("assertion")).toBe(mockJWT);
    });

    it("should handle non-ok response", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Invalid JWT",
      } as Response);

      await expect(getGoogleAccessTokenFromJWT(mockJWT)).rejects.toThrow(
        "Failed to get access token: 401"
      );
    });

    it("should handle missing access_token in response", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ token: "wrong-field" }),
      } as Response);

      await expect(getGoogleAccessTokenFromJWT(mockJWT)).rejects.toThrow(
        "No access_token in response"
      );
    });

    it("should handle network errors", async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

      await expect(getGoogleAccessTokenFromJWT(mockJWT)).rejects.toThrow("Network error");
    });
  });
});

