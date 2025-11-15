import type { Env } from "../index";
import { json } from "../util";
import { getHistoricalPrices } from "./historical-prices";

export async function getHistorical(url: URL, env: Env): Promise<Response> {
  const symbol = url.searchParams.get("symbol");
  const daysParam = url.searchParams.get("days");

  if (!symbol) {
    return json({ error: "symbol parameter is required" }, 400);
  }

  // Parse days parameter with default of 180
  let days = 180;
  if (daysParam) {
    const parsedDays = parseInt(daysParam, 10);
    if (!isNaN(parsedDays) && parsedDays > 0 && parsedDays <= 3650) {
      // Max 10 years (3650 days) to prevent abuse
      days = parsedDays;
    } else {
      return json({ error: "days parameter must be a positive number between 1 and 3650" }, 400);
    }
  }

  try {
    const data = await getHistoricalPrices(symbol, days, env);

    return json({
      symbol: symbol.toUpperCase(),
      days,
      data,
    });
  } catch (error) {
    console.error("ERROR in getHistorical:", error);
    return json({ error: "failed to fetch historical prices" }, 500);
  }
}

