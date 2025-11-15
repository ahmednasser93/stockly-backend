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
    // Fetch quote data
    const quoteApi = `${API_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`;
    const quoteRes = await fetch(quoteApi);
    
    if (!quoteRes.ok) {
      return json({ error: "Failed to fetch quote data" }, 500);
    }
    
    const quoteData = await quoteRes.json();
    const quote = Array.isArray(quoteData) && quoteData.length > 0 ? quoteData[0] : quoteData;

    if (!quote) {
      return json(
        { error: "No data from FMP API. Symbol may be invalid." },
        404
      );
    }

    // Fetch profile data to get image and additional fields
    let profile = null;
    const profileEndpoints = [
      `${API_URL}/profile/${symbol}?apikey=${API_KEY}`,
      `${API_URL}/company/profile/${symbol}?apikey=${API_KEY}`,
    ];
    
    for (const profileApi of profileEndpoints) {
      try {
        const profileRes = await fetch(profileApi);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const fetchedProfile = Array.isArray(profileData) && profileData.length > 0 ? profileData[0] : profileData;
          if (fetchedProfile && (fetchedProfile.image || fetchedProfile.symbol)) {
            profile = fetchedProfile;
            break;
          }
        }
      } catch (profileError) {
        console.warn(`Failed to fetch profile from ${profileApi}:`, profileError);
      }
    }
    
    // If profile endpoints don't work, construct image URL from symbol pattern
    // Based on user's example: https://images.financialmodelingprep.com/symbol/AMZN.png
    if (!profile || !profile.image) {
      profile = {
        ...profile,
        image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png`,
      };
    }

    // Merge quote with profile (profile fields take precedence)
    const parsed = {
      ...quote,
      ...(profile || {}),
    };

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
