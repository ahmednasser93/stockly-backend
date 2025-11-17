import { getCache, setCache } from "./cache";
import type { Env } from "../index";
import { API_KEY, API_URL, json } from "../util";
import { fetchAndSaveHistoricalPrice } from "./historical-prices";
import { getConfig } from "./config";
import { sendFCMNotification } from "../notifications/fcm-sender";

export async function getStock(url: URL, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const symbol = url.searchParams.get("symbol");

  if (!symbol) return json({ error: "symbol required" }, 400);

  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = `quote:${normalizedSymbol}`;
  
  // Check cache first (normal flow)
  const cached = getCache(cacheKey);
  if (cached) return json(cached);

  // Check if provider failure simulation is enabled
  const config = await getConfig(env);
  if (config.featureFlags.simulateProviderFailure) {
    // Simulation mode: return stale data from DB without calling provider
    try {
      const dbRecord = await env.stockly
        .prepare(
          `SELECT symbol, price, day_low, day_high, volume, timestamp
           FROM stock_prices
           WHERE symbol = ?
           ORDER BY timestamp DESC
           LIMIT 1`
        )
        .bind(normalizedSymbol)
        .first<{
          symbol: string;
          price: number | null;
          day_low: number | null;
          day_high: number | null;
          volume: number | null;
          timestamp: number;
        }>();

      if (dbRecord) {
        // Return stale data with simulation flags
        const staleResponse = {
          simulationActive: true,
          stale: true,
          stale_reason: "simulation_mode",
          symbol: dbRecord.symbol,
          price: dbRecord.price,
          dayLow: dbRecord.day_low,
          dayHigh: dbRecord.day_high,
          volume: dbRecord.volume,
          lastUpdatedAt: new Date(dbRecord.timestamp * 1000).toISOString(),
          timestamp: dbRecord.timestamp,
        };

        return json(staleResponse);
      } else {
        // No data in DB either
        return json({ error: "no_price_available" }, 404);
      }
    } catch (dbError) {
      console.error("Failed to fetch from DB during simulation:", dbError);
      return json({ error: "no_price_available" }, 500);
    }
  }

  // Normal flow: fetch from provider
  try {
    // Fetch quote data
    const quoteApi = `${API_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`;
    const quoteRes = await fetch(quoteApi);
    
    if (!quoteRes.ok) {
      // Provider failed - fallback to DB and notify users
      console.warn(`Provider API failed for ${symbol}: HTTP ${quoteRes.status}`);
      return await handleProviderFailure(normalizedSymbol, env, ctx, "provider_api_error");
    }
    
    const quoteData = await quoteRes.json();
    const quote = Array.isArray(quoteData) && quoteData.length > 0 ? quoteData[0] : quoteData;

    if (!quote || (quote && typeof quote === 'object' && ('Error Message' in quote || 'error' in quote))) {
      // Provider returned error or invalid data - fallback to DB
      console.warn(`Provider API returned invalid data for ${symbol}`);
      return await handleProviderFailure(normalizedSymbol, env, ctx, "provider_invalid_data");
    }

    // Fetch profile data to get image, description, and additional fields
    // Try multiple endpoint versions and paths
    let profile = null;
    let profileDescription = null;
    
    // Try all possible FMP profile endpoints
    // IMPORTANT: Use query parameter ?symbol= not path parameter /profile/SYMBOL
    const profileEndpoints = [
      // Correct format: /stable/profile?symbol=SYMBOL (with query param)
      `${API_URL}/profile?symbol=${symbol}&apikey=${API_KEY}`,
      // Try path-based format as fallback (some endpoints use this)
      `${API_URL}/profile/${symbol}?apikey=${API_KEY}`,
      `${API_URL}/company/profile/${symbol}?apikey=${API_KEY}`,
      // Try v3 API as last resort (requires legacy subscription)
      `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${API_KEY}`,
    ];
    
    for (const profileApi of profileEndpoints) {
      try {
        const profileRes = await fetch(profileApi, {
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          // Log what we get from profile endpoint for debugging
          console.log(`Profile API ${profileApi} response type:`, Array.isArray(profileData) ? 'array' : typeof profileData);
          console.log(`Profile API ${profileApi} response length:`, Array.isArray(profileData) ? profileData.length : 'N/A');
          
          if (Array.isArray(profileData) && profileData.length === 0) {
            console.log(`Profile API ${profileApi} returned empty array`);
            continue;
          }
          
          const fetchedProfile = Array.isArray(profileData) && profileData.length > 0 ? profileData[0] : profileData;
          
          // Check for error messages
          if (fetchedProfile && fetchedProfile['Error Message']) {
            console.warn(`Profile API ${profileApi} returned error:`, fetchedProfile['Error Message']);
            continue;
          }
          
          if (fetchedProfile && (fetchedProfile.symbol || fetchedProfile.Symbol)) {
            profile = fetchedProfile;
            // Capture description from profile if available (try multiple field names)
            const desc = fetchedProfile.description || fetchedProfile.Description || fetchedProfile.descriptionText;
            if (desc) {
              profileDescription = desc;
              console.log(`Found description from profile: ${desc.substring(0, 100)}...`);
              break;
            } else {
              console.log(`Profile fetched but no description field. Profile keys:`, Object.keys(fetchedProfile).slice(0, 20));
            }
            // If we got a valid profile, use it even without description
            break;
          } else {
            console.log(`Profile endpoint returned invalid data structure:`, typeof fetchedProfile);
          }
        } else {
          console.warn(`Profile API ${profileApi} returned status:`, profileRes.status, await profileRes.text().catch(() => ''));
        }
      } catch (profileError) {
        console.warn(`Failed to fetch profile from ${profileApi}:`, profileError);
      }
    }
    
    // Capture description from quote before merging
    const quoteDescription = quote?.description || null;
    
    // If profile endpoints don't work, construct image URL from symbol pattern
    // Based on user's example: https://images.financialmodelingprep.com/symbol/AMZN.png
    if (!profile || !profile.image) {
      profile = {
        ...profile,
        image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png`,
      };
    }

    // Try to get description from Wikipedia as fallback if FMP doesn't provide it
    let wikipediaDescription = null;
    if (!profileDescription && !quoteDescription) {
      try {
        // Get company name from quote or profile
        const companyName = quote?.name || quote?.companyName || profile?.name || profile?.companyName || symbol;
        
        // Try to fetch from Wikipedia API
        const wikiSearchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(companyName)}`;
        const wikiRes = await fetch(wikiSearchUrl);
        
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          if (wikiData.extract) {
            wikipediaDescription = wikiData.extract;
            console.log(`Found description from Wikipedia: ${wikipediaDescription.substring(0, 100)}...`);
          }
        }
      } catch (wikiError) {
        console.warn(`Failed to fetch from Wikipedia:`, wikiError);
      }
    }

    // Merge quote with profile (profile fields take precedence)
    // Explicitly preserve description: profile description > quote description > wikipedia
    const finalDescription = profileDescription || quoteDescription || profile?.description || wikipediaDescription || null;
    
    // Log final description for debugging
    console.log(`Final description: ${finalDescription ? finalDescription.substring(0, 100) + '...' : 'null'}`);
    console.log(`Quote has description:`, !!quoteDescription);
    console.log(`Profile has description:`, !!profileDescription);
    console.log(`Profile object has description:`, !!(profile?.description));
    
    const parsed = {
      ...quote,
      ...(profile || {}),
      // Explicitly set description to ensure it's not lost during merge
      description: finalDescription,
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

    // Fetch and save historical prices in background (non-blocking)
    if (ctx && symbol) {
      ctx.waitUntil(fetchAndSaveHistoricalPrice(symbol, env, ctx));
    }

    return json(parsed);
  } catch (err) {
    console.error("ERROR in getStock:", err);
    
    // Provider failure (network error, timeout, etc.) - fallback to DB
    if (err instanceof Error && (
      err.message.includes('fetch') || 
      err.message.includes('network') || 
      err.message.includes('timeout') ||
      err.message.includes('Failed to fetch')
    )) {
      console.warn(`Provider fetch error for ${normalizedSymbol}:`, err.message);
      return await handleProviderFailure(normalizedSymbol, env, ctx, "provider_network_error");
    }
    
    // Unknown error - try fallback but return error if DB also fails
    try {
      return await handleProviderFailure(normalizedSymbol, env, ctx, "provider_unknown_error");
    } catch (fallbackErr) {
      console.error("Both provider and DB fallback failed:", fallbackErr);
      return json({ error: "failed to fetch stock" }, 500);
    }
  }
}

/**
 * Handle provider failure by returning cached DB data and notifying users
 */
async function handleProviderFailure(
  symbol: string,
  env: Env,
  ctx?: ExecutionContext,
  failureReason: string = "provider_failure"
): Promise<Response> {
  try {
    // Try to get last cached price from DB
    const dbRecord = await env.stockly
      .prepare(
        `SELECT symbol, price, day_low, day_high, volume, timestamp
         FROM stock_prices
         WHERE symbol = ?
         ORDER BY timestamp DESC
         LIMIT 1`
      )
      .bind(symbol)
      .first<{
        symbol: string;
        price: number | null;
        day_low: number | null;
        day_high: number | null;
        volume: number | null;
        timestamp: number;
      }>();

    if (dbRecord) {
      // Send notifications to all registered users in background
      if (ctx) {
        ctx.waitUntil(notifyUsersOfProviderFailure(symbol, env));
      }

      // Return stale data with provider failure flags
      const staleResponse = {
        stale: true,
        stale_reason: failureReason,
        symbol: dbRecord.symbol,
        price: dbRecord.price,
        dayLow: dbRecord.day_low,
        dayHigh: dbRecord.day_high,
        volume: dbRecord.volume,
        lastUpdatedAt: new Date(dbRecord.timestamp * 1000).toISOString(),
        timestamp: dbRecord.timestamp,
      };

      return json(staleResponse);
    } else {
      // No data in DB either
      return json({ error: "no_price_available" }, 404);
    }
  } catch (dbError) {
    console.error("Failed to fetch from DB during provider failure:", dbError);
    return json({ error: "no_price_available" }, 500);
  }
}

/**
 * Send notifications to all registered users about provider failure
 * Runs in background using ctx.waitUntil
 * Uses KV to throttle notifications (max once per 5 minutes per symbol)
 */
async function notifyUsersOfProviderFailure(symbol: string, env: Env): Promise<void> {
  try {
    // Throttle notifications using KV - only send once per 5 minutes per symbol
    if (env.alertsKv) {
      const throttleKey = `provider_failure:${symbol}:notification_sent`;
      const lastSent = await env.alertsKv.get(throttleKey);
      const now = Math.floor(Date.now() / 1000);
      const THROTTLE_WINDOW_SECONDS = 300; // 5 minutes

      if (lastSent) {
        const lastSentTime = parseInt(lastSent, 10);
        const timeSinceLastSent = now - lastSentTime;
        
        if (timeSinceLastSent < THROTTLE_WINDOW_SECONDS) {
          console.log(`Provider failure notification for ${symbol} throttled. Last sent ${timeSinceLastSent}s ago.`);
          return; // Skip notification - too soon since last one
        }
      }

      // Mark notification as sent
      await env.alertsKv.put(throttleKey, now.toString(), { expirationTtl: THROTTLE_WINDOW_SECONDS });
    }

    // Get all registered push tokens
    const rows = await env.stockly
      .prepare(
        `SELECT user_id, push_token 
         FROM user_push_tokens 
         WHERE push_token IS NOT NULL AND push_token != ''`
      )
      .all<{
        user_id: string;
        push_token: string;
      }>();

    if (!rows || !rows.results || rows.results.length === 0) {
      console.log("No registered users to notify about provider failure");
      return;
    }

    const users = rows.results;
    console.log(`Sending provider failure notifications to ${users.length} users for ${symbol}`);

    // Send notifications to all users in parallel (non-blocking)
    const notificationPromises = users.map(async (user) => {
      try {
        await sendFCMNotification(
          user.push_token,
          "⚠️ Service Alert: Using Cached Data",
          `We're experiencing issues with our data provider. Showing last saved price for ${symbol}. We're working on restoring full service.`,
          {
            type: "provider_failure",
            symbol: symbol,
            stale: "true",
          },
          env
        );
        console.log(`✅ Provider failure notification sent to user ${user.user_id}`);
      } catch (err) {
        console.error(`❌ Failed to send provider failure notification to user ${user.user_id}:`, err);
        // Don't throw - continue with other users
      }
    });

    // Wait for all notifications to complete (or fail silently)
    await Promise.allSettled(notificationPromises);
    console.log(`Completed sending provider failure notifications to ${users.length} users`);
  } catch (error) {
    console.error("Failed to send provider failure notifications:", error);
    // Don't throw - notification failure shouldn't block the response
  }
}
