import { json } from "../util";
import type { Env } from "../index";

export interface AdminConfig {
  pollingIntervalSec: number;
  primaryProvider: string;
  backupProvider: string;
  alertThrottle: {
    maxAlerts: number;
    windowSeconds: number;
  };
  featureFlags: {
    alerting: boolean;
    sandboxMode: boolean;
    simulateProviderFailure: boolean;
  };
}

const DEFAULT_CONFIG: AdminConfig = {
  pollingIntervalSec: 30,
  primaryProvider: "alpha-feed",
  backupProvider: "beta-feed",
  alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
  featureFlags: {
    alerting: true,
    sandboxMode: false,
    simulateProviderFailure: false,
  },
};

const CONFIG_KEY = "admin:config";

/**
 * Get admin configuration from KV store
 * Returns default config if not found
 */
export async function getConfig(env: Env): Promise<AdminConfig> {
  try {
    if (!env.alertsKv) {
      console.warn("alertsKv not available, using default config");
      return DEFAULT_CONFIG;
    }

    const stored = await env.alertsKv.get(CONFIG_KEY);
    if (!stored) {
      return DEFAULT_CONFIG;
    }

    const parsed = JSON.parse(stored) as Partial<AdminConfig>;
    // Merge with defaults to ensure all fields are present
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      alertThrottle: {
        ...DEFAULT_CONFIG.alertThrottle,
        ...(parsed.alertThrottle || {}),
      },
      featureFlags: {
        ...DEFAULT_CONFIG.featureFlags,
        ...(parsed.featureFlags || {}),
      },
    };
  } catch (error) {
    console.error("Failed to get config:", error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Update admin configuration in KV store
 */
export async function updateConfig(
  env: Env,
  updates: Partial<AdminConfig>
): Promise<AdminConfig> {
  try {
    if (!env.alertsKv) {
      console.warn("alertsKv not available, cannot update config");
      return { ...DEFAULT_CONFIG, ...updates } as AdminConfig;
    }

    const current = await getConfig(env);
    const merged: AdminConfig = {
      ...current,
      ...updates,
      alertThrottle: updates.alertThrottle
        ? { ...current.alertThrottle, ...updates.alertThrottle }
        : current.alertThrottle,
      featureFlags: updates.featureFlags
        ? { ...current.featureFlags, ...updates.featureFlags }
        : current.featureFlags,
    };

    await env.alertsKv.put(CONFIG_KEY, JSON.stringify(merged));
    return merged;
  } catch (error) {
    console.error("Failed to update config:", error);
    throw error;
  }
}

/**
 * Get config endpoint handler
 */
export async function getConfigEndpoint(env: Env): Promise<Response> {
  const config = await getConfig(env);
  return json(config);
}

/**
 * Update config endpoint handler
 */
export async function updateConfigEndpoint(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json();
    const config = await updateConfig(env, body);
    return json(config);
  } catch (error) {
    console.error("Failed to update config:", error);
    return json({ error: "Failed to update config" }, 500);
  }
}

/**
 * Simulate provider failure - enable simulation mode
 */
export async function simulateProviderFailureEndpoint(
  env: Env
): Promise<Response> {
  const config = await updateConfig(env, {
    featureFlags: {
      simulateProviderFailure: true,
    },
  });
  return json(config);
}

/**
 * Disable provider failure simulation
 */
export async function disableProviderFailureEndpoint(
  env: Env
): Promise<Response> {
  const config = await updateConfig(env, {
    featureFlags: {
      simulateProviderFailure: false,
    },
  });
  return json(config);
}

