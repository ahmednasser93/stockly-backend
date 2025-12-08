/**
 * Route handler for /v1/api/get-stock-details
 * Returns comprehensive stock details by aggregating multiple FMP endpoints
 */

import { json } from "../util";
import type { Env } from "../index";
import { getStockDetails } from "../services/get-stock-details";

import type { Logger } from "../logging/logger";

export async function getStockDetailsRoute(
  url: URL,
  env: Env,
  ctx: ExecutionContext | undefined,
  logger: Logger
): Promise<Response> {
  const symbol = url.searchParams.get("symbol");

  if (!symbol) {
    return json({ error: "symbol required" }, 400);
  }

  // Validate symbol format (basic validation)
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
    return json({ error: "invalid symbol format" }, 400);
  }

  try {
    const result = await getStockDetails(normalizedSymbol, env, ctx);

    // Check if result is an error (has error field but not profile/quote)
    if ("error" in result && !("profile" in result)) {
      return json(result, 500);
    }

    return json(result);
  } catch (error) {
    console.error("Error in getStockDetailsRoute:", error);
    return json(
      { error: "Internal server error", symbol: normalizedSymbol },
      500
    );
  }
}

