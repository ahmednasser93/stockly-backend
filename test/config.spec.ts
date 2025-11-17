import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getConfig,
  updateConfig,
  simulateProviderFailureEndpoint,
  disableProviderFailureEndpoint,
} from "../src/api/config";
import type { Env } from "../src/index";

const createEnv = (): Env => {
  const kvMap = new Map<string, string>();
  const get = vi.fn((key: string) => kvMap.get(key) ?? null);
  const put = vi.fn((key: string, value: string) => {
    kvMap.set(key, value);
    return Promise.resolve();
  });
  
  return {
    stockly: {} as any,
    alertsKv: {
      get,
      put,
    } as any,
  };
};

describe("Config System", () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getConfig", () => {
    it("returns default config when KV is not available", async () => {
      const envWithoutKv: Env = { stockly: {} as any };
      const config = await getConfig(envWithoutKv);
      
      expect(config.featureFlags.simulateProviderFailure).toBe(false);
      expect(config.pollingIntervalSec).toBe(30);
    });

    it("returns default config when no stored config exists", async () => {
      const config = await getConfig(env);
      
      expect(config.featureFlags.simulateProviderFailure).toBe(false);
      expect(config.pollingIntervalSec).toBe(30);
    });

    it("returns stored config when available", async () => {
      const storedConfig = {
        pollingIntervalSec: 60,
        primaryProvider: "alpha-feed",
        backupProvider: "beta-feed",
        alertThrottle: { maxAlerts: 200, windowSeconds: 120 },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: true,
        },
      };
      
      await env.alertsKv!.put("admin:config", JSON.stringify(storedConfig));
      const config = await getConfig(env);
      
      expect(config.featureFlags.simulateProviderFailure).toBe(true);
      expect(config.pollingIntervalSec).toBe(60);
    });

    it("merges partial stored config with defaults", async () => {
      const partialConfig = {
        featureFlags: {
          simulateProviderFailure: true,
        },
      };
      
      await env.alertsKv!.put("admin:config", JSON.stringify(partialConfig));
      const config = await getConfig(env);
      
      expect(config.featureFlags.simulateProviderFailure).toBe(true);
      expect(config.pollingIntervalSec).toBe(30); // Default value
    });
  });

  describe("updateConfig", () => {
    it("updates config with new values", async () => {
      const updates = {
        pollingIntervalSec: 45,
        featureFlags: {
          simulateProviderFailure: true,
        },
      };
      
      const updated = await updateConfig(env, updates);
      
      expect(updated.pollingIntervalSec).toBe(45);
      expect(updated.featureFlags.simulateProviderFailure).toBe(true);
    });

    it("merges nested objects correctly", async () => {
      const initialConfig = {
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };
      
      await env.alertsKv!.put("admin:config", JSON.stringify(initialConfig));
      
      const updates = {
        featureFlags: {
          simulateProviderFailure: true,
        },
      };
      
      const updated = await updateConfig(env, updates);
      
      expect(updated.featureFlags.simulateProviderFailure).toBe(true);
      expect(updated.featureFlags.alerting).toBe(true); // Preserved
      expect(updated.featureFlags.sandboxMode).toBe(false); // Preserved
    });
  });

  describe("simulateProviderFailureEndpoint", () => {
    it("enables simulation mode", async () => {
      const request = new Request("http://example.com/v1/api/simulate-provider-failure", {
        method: "POST",
      });
      
      const response = await simulateProviderFailureEndpoint(env);
      const data = await response.json();
      
      expect(data.featureFlags.simulateProviderFailure).toBe(true);
      expect(response.status).toBe(200);
    });

    it("persists the config change", async () => {
      await simulateProviderFailureEndpoint(env);
      
      const config = await getConfig(env);
      expect(config.featureFlags.simulateProviderFailure).toBe(true);
    });
  });

  describe("disableProviderFailureEndpoint", () => {
    it("disables simulation mode", async () => {
      // First enable it
      await updateConfig(env, {
        featureFlags: {
          simulateProviderFailure: true,
        },
      });
      
      const response = await disableProviderFailureEndpoint(env);
      const data = await response.json();
      
      expect(data.featureFlags.simulateProviderFailure).toBe(false);
      expect(response.status).toBe(200);
    });

    it("persists the config change", async () => {
      // Enable first
      await updateConfig(env, {
        featureFlags: {
          simulateProviderFailure: true,
        },
      });
      
      await disableProviderFailureEndpoint(env);
      
      const config = await getConfig(env);
      expect(config.featureFlags.simulateProviderFailure).toBe(false);
    });
  });
});

