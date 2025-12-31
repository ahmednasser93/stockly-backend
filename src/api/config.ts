import { json } from "../util";
import type { Env } from "../index";

export interface AdminConfig {
  pollingIntervalSec: number;
  kvWriteIntervalSec: number;
  primaryProvider: string;
  backupProvider: string;
  alertThrottle: {
    maxAlerts: number;
    windowSeconds: number;
  };
  marketCache?: {
    marketDataTtlSec: number; // Cache TTL for gainers/losers/actives (default: 300 = 5 minutes)
    sectorsTtlSec: number; // Cache TTL for sectors performance (default: 2700 = 45 minutes)
    newsTtlSec?: number; // Cache TTL for general news (default: 3600 = 1 hour)
    prefetchCronInterval: string; // Cron expression for prefetch (default: "0 * * * *" = hourly)
  };
  workingHours?: {
    enabled: boolean; // Enable/disable working hours feature
    startHour: number; // 0-23 (default: 10)
    endHour: number; // 0-23 (default: 23)
    timezone: string; // IANA timezone (default: "Europe/Madrid")
  };
  featureFlags: {
    alerting: boolean;
    sandboxMode: boolean;
    simulateProviderFailure: boolean;
  };
}

const DEFAULT_CONFIG: AdminConfig = {
  pollingIntervalSec: 30,
  kvWriteIntervalSec: 3600, // 1 hour in seconds
  primaryProvider: "alpha-feed",
  backupProvider: "beta-feed",
  alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
  marketCache: {
    marketDataTtlSec: 300, // 5 minutes
    sectorsTtlSec: 2700, // 45 minutes
    newsTtlSec: 3600, // 1 hour
    prefetchCronInterval: "0 * * * *", // Every 1 hour (hourly)
  },
  workingHours: {
    enabled: true, // Working hours feature enabled by default
    startHour: 10, // 10 AM
    endHour: 23, // 11 PM
    timezone: "Europe/Madrid", // Madrid timezone
  },
  featureFlags: {
    alerting: true,
    sandboxMode: false,
    simulateProviderFailure: false,
  },
};

const CONFIG_KEY = "admin:config";

// In-memory cache for config to reduce KV reads
// Config is read on every stock request, so caching saves significant KV operations
let cachedConfig: AdminConfig | null = null;
let configCachedAt: number = 0;
const CONFIG_CACHE_TTL_MS = 60 * 1000; // Cache for 1 minute (config rarely changes)

/**
 * Get admin configuration from KV store (with in-memory cache)
 * Returns default config if not found
 * 
 * This function is called on every stock API request, so we cache the config
 * in memory to avoid unnecessary KV reads. The cache expires after 1 minute.
 */
export async function getConfig(env: Env): Promise<AdminConfig> {
  const now = Date.now();
  
  // Return cached config if still valid (avoids KV read)
  if (cachedConfig && (now - configCachedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    if (!env.alertsKv) {
      console.warn("alertsKv not available, using default config");
      // Cache default config to avoid repeated warnings
      cachedConfig = DEFAULT_CONFIG;
      configCachedAt = now;
      return DEFAULT_CONFIG;
    }

    const stored = await env.alertsKv.get(CONFIG_KEY);
    if (!stored) {
      // Cache default config
      cachedConfig = DEFAULT_CONFIG;
      configCachedAt = now;
      return DEFAULT_CONFIG;
    }

    const parsed = JSON.parse(stored) as Partial<AdminConfig>;
    // Merge with defaults to ensure all fields are present
    const merged: AdminConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      alertThrottle: {
        ...DEFAULT_CONFIG.alertThrottle,
        ...(parsed.alertThrottle || {}),
      },
      marketCache: {
        ...DEFAULT_CONFIG.marketCache!,
        ...(parsed.marketCache || {}),
      },
      workingHours: {
        ...DEFAULT_CONFIG.workingHours!,
        ...(parsed.workingHours || {}),
      },
      featureFlags: {
        ...DEFAULT_CONFIG.featureFlags,
        ...(parsed.featureFlags || {}),
      },
    };
    
    // Cache the merged config
    cachedConfig = merged;
    configCachedAt = now;
    return merged;
  } catch (error) {
    console.error("Failed to get config:", error);
    // Cache default config on error to avoid repeated failures
    cachedConfig = DEFAULT_CONFIG;
    configCachedAt = now;
    return DEFAULT_CONFIG;
  }
}

/**
 * Update admin configuration in KV store
 * Invalidates in-memory cache to ensure next read gets fresh data
 */
export async function updateConfig(
  env: Env,
  updates: Partial<AdminConfig>
): Promise<AdminConfig> {
  try {
    if (!env.alertsKv) {
      console.warn("alertsKv not available, cannot update config");
      const merged = { ...DEFAULT_CONFIG, ...updates } as AdminConfig;
      // Update cache with new config (even without KV)
      cachedConfig = merged;
      configCachedAt = Date.now();
      return merged;
    }

    const current = await getConfig(env);
    const merged: AdminConfig = {
      ...current,
      ...updates,
      alertThrottle: updates.alertThrottle
        ? { ...current.alertThrottle, ...updates.alertThrottle }
        : current.alertThrottle,
      marketCache: updates.marketCache
        ? { ...(current.marketCache || DEFAULT_CONFIG.marketCache!), ...updates.marketCache }
        : current.marketCache || DEFAULT_CONFIG.marketCache,
      workingHours: updates.workingHours
        ? { ...(current.workingHours || DEFAULT_CONFIG.workingHours!), ...updates.workingHours }
        : current.workingHours || DEFAULT_CONFIG.workingHours,
      featureFlags: updates.featureFlags
        ? { ...current.featureFlags, ...updates.featureFlags }
        : current.featureFlags,
    };

    await env.alertsKv.put(CONFIG_KEY, JSON.stringify(merged));
    
    // Update cache immediately with new config (invalidate old cache)
    cachedConfig = merged;
    configCachedAt = Date.now();
    
    return merged;
  } catch (error) {
    console.error("Failed to update config:", error);
    // Invalidate cache on error to force fresh read next time
    cachedConfig = null;
    configCachedAt = 0;
    throw error;
  }
}

/**
 * Clear config cache (useful for testing or forced refresh)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  configCachedAt = 0;
}

/**
 * Get config endpoint handler
 */
import type { Logger } from "../logging/logger";

export async function getConfigEndpoint(env: Env, logger: Logger): Promise<Response> {
  const config = await getConfig(env);
  return json(config);
}

/**
 * Update config endpoint handler
 */
export async function updateConfigEndpoint(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const body = await request.json() as Partial<AdminConfig>;
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
  env: Env,
  logger?: Logger
): Promise<Response> {
  const current = await getConfig(env);
  const config = await updateConfig(env, {
    featureFlags: {
      ...current.featureFlags,
      simulateProviderFailure: true,
    },
  });
  return json(config);
}

/**
 * Disable provider failure simulation
 */
export async function disableProviderFailureEndpoint(
  env: Env,
  logger?: Logger
): Promise<Response> {
  const current = await getConfig(env);
  const config = await updateConfig(env, {
    featureFlags: {
      ...current.featureFlags,
      simulateProviderFailure: false,
    },
  });
  return json(config);
}

