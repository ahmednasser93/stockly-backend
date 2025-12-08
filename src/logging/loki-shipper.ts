/**
 * Grafana Loki Log Shipper
 * 
 * Formats and ships structured JSON logs to Grafana Loki via HTTP API.
 * Uses non-blocking async shipping to avoid delaying API responses.
 */

import type { LogEntry } from "./logger";

export interface LokiConfig {
  url: string;
  labels?: Record<string, string>;
  username?: string; // For Grafana Cloud Basic Auth
  password?: string; // For Grafana Cloud Basic Auth (or API token)
}

/**
 * Format logs into Loki-compatible HTTP payload
 * 
 * Loki expects logs in the format:
 * {
 *   "streams": [
 *     {
 *       "stream": { "label1": "value1", "label2": "value2" },
 *       "values": [
 *         [ "nanoseconds_timestamp", "log_line" ],
 *         ...
 *       ]
 *     }
 *   ]
 * }
 */
function formatLogsForLoki(logs: LogEntry[], config: LokiConfig): string {
  const labels = {
    service: "stockly-api",
    ...config.labels,
  };

  // Convert ISO timestamps to nanoseconds (Loki expects nanoseconds since epoch)
  const values = logs.map((log) => {
    const timestampNs = BigInt(new Date(log.timestamp).getTime()) * BigInt(1_000_000);
    const logLine = JSON.stringify(log);
    return [timestampNs.toString(), logLine];
  });

  const payload = {
    streams: [
      {
        stream: labels,
        values,
      },
    ],
  };

  return JSON.stringify(payload);
}

/**
 * Ship logs to Grafana Loki asynchronously
 * 
 * This function should be called via ctx.waitUntil() to ensure
 * it doesn't block the main response.
 * 
 * @param logs Array of structured log entries
 * @param config Loki configuration
 * @returns Promise that resolves when shipping is complete (or failed)
 */
export async function sendLogsToLoki(
  logs: LogEntry[],
  config: LokiConfig
): Promise<void> {
  // Don't ship if no logs
  if (!logs || logs.length === 0) {
    return;
  }

  // Don't ship if URL is not configured
  if (!config.url) {
    console.warn("[Loki Shipper] LOKI_URL not configured, skipping log shipping");
    return;
  }

  try {
    const payload = formatLogsForLoki(logs, config);

    // Loki HTTP API endpoint: POST /loki/api/v1/push
    const lokiUrl = config.url.endsWith("/")
      ? `${config.url}loki/api/v1/push`
      : `${config.url}/loki/api/v1/push`;

    // Prepare headers with authentication if provided
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Add Basic Auth for Grafana Cloud (username is usually your Grafana Cloud instance ID)
    if (config.username && config.password) {
      const auth = btoa(`${config.username}:${config.password}`);
      headers["Authorization"] = `Basic ${auth}`;
    }

    const response = await fetch(lokiUrl, {
      method: "POST",
      headers,
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Loki API returned ${response.status} ${response.statusText}: ${errorText}`
      );
    }

    // Success - logs shipped
    console.log(`[Loki Shipper] Successfully shipped ${logs.length} log entries`);
  } catch (error) {
    // Log failure locally but don't throw - we don't want log shipping
    // failures to cause cascading failures in the API
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Loki Shipper] Failed to ship logs: ${errorMessage}. Dropping ${logs.length} log entries.`
    );

    // Optionally, you could implement a fallback mechanism here:
    // - Store logs in KV for retry later
    // - Send to a secondary logging endpoint
    // - Rate limit retry attempts
  }
}

