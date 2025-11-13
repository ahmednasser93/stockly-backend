import { getCache, setCache } from "./cache";
import type { Env } from "../index";
import { API_KEY, API_URL, json } from "../util";

export async function getStock(url: URL, env: Env): Promise<Response> {
  const symbol = url.searchParams.get("symbol");

  if (!symbol) return json({ error: "symbol required" }, 400);

  const cacheKey = `quote:${symbol.toUpperCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return json(cached);

  try {
    const api = `${API_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`;
    const res = await fetch(api);
    const data = await res.json();

    const parsed =
      Array.isArray(data) && data.length > 0 ? data[0] : null;

    if (!parsed) {
      return json(
        { error: "No data from FMP API. Symbol may be invalid." },
        404
      );
    }

    setCache(cacheKey, parsed, 30);

    await env.stockly
      .prepare(
        `INSERT INTO stock_prices (symbol, price, day_low, day_high, volume, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        parsed.symbol,
        parsed.price,
        parsed.dayLow,
        parsed.dayHigh,
        parsed.volume,
        parsed.timestamp
      )
      .run();

    return json(parsed);
  } catch (err) {
    console.error("ERROR in getStock:", err);
    return json({ error: "failed to fetch stock" }, 500);
  }
}
