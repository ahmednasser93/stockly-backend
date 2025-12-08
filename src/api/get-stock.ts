import { getCacheIfValid, setCache } from "./cache";
import type { Env } from "../index";
import { API_KEY, API_URL, json } from "../util";
import { fetchAndSaveHistoricalPrice } from "./historical-prices";
import { getConfig } from "./config";
import { sendFCMNotification } from "../notifications/fcm-sender";
import type { Logger } from "../logging/logger";

export async function getStock(
  url: URL,
  env: Env,
  ctx: ExecutionContext | undefined,
  logger: Logger
): Promise<Response> {
  const symbol = url.searchParams.get("symbol");

  if (!symbol) return json({ error: "symbol required" }, 400);

  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = `quote:${normalizedSymbol}`;
  
  // Get config first to check polling interval
  const config = await getConfig(env);
  const pollingIntervalSec = config.pollingIntervalSec;
  
  // Check cache with polling interval validation
  // This checks if cachedAt timestamp is still within the polling interval
  const cachedEntry = getCacheIfValid(cacheKey, pollingIntervalSec);
  if (cachedEntry) {
    // Cache is still valid (age < pollingIntervalSec), return cached data
    const ageSeconds = Math.floor((Date.now() - cachedEntry.cachedAt) / 1000);
    logger.info(`Cache hit for ${normalizedSymbol}`, {
      ageSeconds,
      pollingIntervalSec,
      cacheStatus: "HIT",
    });
    return json(cachedEntry.data);
  }

  // Cache is either missing or too old (age >= pollingIntervalSec)
  // Need to fetch fresh data from provider
  // Check if cache exists at all (even if expired) for logging
  const existingCacheEntry = getCacheIfValid(cacheKey, Infinity);
  if (existingCacheEntry) {
    const ageSeconds = Math.floor((Date.now() - existingCacheEntry.cachedAt) / 1000);
    logger.info(`Cache expired for ${normalizedSymbol}`, {
      ageSeconds,
      pollingIntervalSec,
      cacheStatus: "EXPIRED",
    });
  } else {
    logger.info(`No cache for ${normalizedSymbol}`, { cacheStatus: "MISS" });
  }

  // Check if provider failure simulation is enabled
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
      logger.error("Failed to fetch from DB during simulation", dbError);
      return json({ error: "no_price_available" }, 500);
    }
  }

  // Normal flow: fetch from provider
  try {
    // Fetch quote data
    const quoteApi = `${API_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`;
    const quoteStartTime = Date.now();
    const quoteRes = await fetch(quoteApi);
    const quoteLatencyMs = Date.now() - quoteStartTime;
    
    logger.logApiCall(`FMP API: GET /quote`, {
      apiProvider: "FMP",
      endpoint: "/quote",
      method: "GET",
      statusCode: quoteRes.status,
      latencyMs: quoteLatencyMs,
    });
    
    if (!quoteRes.ok) {
      // Provider failed - fallback to DB and notify users
      logger.warn(`Provider API failed for ${symbol}`, {
        statusCode: quoteRes.status,
        apiProvider: "FMP",
      });
      return await handleProviderFailure(normalizedSymbol, env, ctx, "provider_api_error", logger);
    }
    
    const quoteData = await quoteRes.json();
    const quote = Array.isArray(quoteData) && quoteData.length > 0 ? quoteData[0] : quoteData;

    if (!quote || (quote && typeof quote === 'object' && ('Error Message' in quote || 'error' in quote))) {
      // Provider returned error or invalid data - fallback to DB
      logger.warn(`Provider API returned invalid data for ${symbol}`, {
        apiProvider: "FMP",
      });
      return await handleProviderFailure(normalizedSymbol, env, ctx, "provider_invalid_data", logger);
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
        const profileStartTime = Date.now();
        const profileRes = await fetch(profileApi, {
          headers: {
            'Accept': 'application/json',
          },
        });
        const profileLatencyMs = Date.now() - profileStartTime;
        
        logger.logApiCall(`FMP API: GET /profile`, {
          apiProvider: "FMP",
          endpoint: "/profile",
          method: "GET",
          statusCode: profileRes.status,
          latencyMs: profileLatencyMs,
        });
        
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          // Log what we get from profile endpoint for debugging
          logger.debug(`Profile API response`, {
            endpoint: profileApi,
            responseType: Array.isArray(profileData) ? 'array' : typeof profileData,
            responseLength: Array.isArray(profileData) ? profileData.length : 'N/A',
          });
          
          if (Array.isArray(profileData) && profileData.length === 0) {
            logger.debug(`Profile API returned empty array`, { endpoint: profileApi });
            continue;
          }
          
          const fetchedProfile = Array.isArray(profileData) && profileData.length > 0 ? profileData[0] : profileData;
          
          // Check for error messages
          if (fetchedProfile && fetchedProfile['Error Message']) {
            logger.warn(`Profile API returned error`, {
              endpoint: profileApi,
              errorMessage: fetchedProfile['Error Message'],
            });
            continue;
          }
          
          if (fetchedProfile && (fetchedProfile.symbol || fetchedProfile.Symbol)) {
            profile = fetchedProfile;
            // Capture description from profile if available (try multiple field names)
            const desc = fetchedProfile.description || fetchedProfile.Description || fetchedProfile.descriptionText;
            if (desc) {
              profileDescription = desc;
              logger.debug(`Found description from profile`, {
                descriptionLength: desc.length,
              });
              break;
            } else {
              logger.debug(`Profile fetched but no description field`, {
                profileKeys: Object.keys(fetchedProfile).slice(0, 20),
              });
            }
            // If we got a valid profile, use it even without description
            break;
          } else {
            logger.debug(`Profile endpoint returned invalid data structure`, {
              endpoint: profileApi,
              dataType: typeof fetchedProfile,
            });
          }
        } else {
          const errorText = await profileRes.text().catch(() => '');
          logger.warn(`Profile API returned non-ok status`, {
            endpoint: profileApi,
            statusCode: profileRes.status,
            errorText: errorText.substring(0, 200),
          });
        }
      } catch (profileError) {
        logger.warn(`Failed to fetch profile`, {
          endpoint: profileApi,
          error: profileError instanceof Error ? profileError.message : String(profileError),
        });
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
            logger.debug(`Found description from Wikipedia`, {
              descriptionLength: wikipediaDescription.length,
            });
          }
        }
      } catch (wikiError) {
        logger.warn(`Failed to fetch from Wikipedia`, {
          error: wikiError instanceof Error ? wikiError.message : String(wikiError),
        });
      }
    }

    // Merge quote with profile (profile fields take precedence)
    // Explicitly preserve description: profile description > quote description > wikipedia
    const finalDescription = profileDescription || quoteDescription || profile?.description || wikipediaDescription || null;
    
    // Log final description for debugging
    logger.debug(`Final description resolved`, {
      hasDescription: !!finalDescription,
      descriptionLength: finalDescription?.length || 0,
      source: finalDescription ? (
        profileDescription ? "profile" :
        quoteDescription ? "quote" :
        profile?.description ? "profile_object" :
        wikipediaDescription ? "wikipedia" : "none"
      ) : "none",
    });
    
    const parsed = {
      ...quote,
      ...(profile || {}),
      // Explicitly set description to ensure it's not lost during merge
      description: finalDescription,
    };

    // Use pollingIntervalSec from config for cache TTL
    // Set TTL to be slightly longer than polling interval to avoid edge cases
    setCache(cacheKey, parsed, pollingIntervalSec + 5);

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
    logger.error("ERROR in getStock", err, { symbol: normalizedSymbol });
    
    // Provider failure (network error, timeout, etc.) - fallback to DB
    if (err instanceof Error && (
      err.message.includes('fetch') || 
      err.message.includes('network') || 
      err.message.includes('timeout') ||
      err.message.includes('Failed to fetch')
    )) {
      logger.warn(`Provider fetch error for ${normalizedSymbol}`, {
        error: err.message,
        apiProvider: "FMP",
      });
      return await handleProviderFailure(normalizedSymbol, env, ctx, "provider_network_error", logger);
    }
    
    // Unknown error - try fallback but return error if DB also fails
    try {
      return await handleProviderFailure(normalizedSymbol, env, ctx, "provider_unknown_error", logger);
    } catch (fallbackErr) {
      logger.error("Both provider and DB fallback failed", fallbackErr);
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
  ctx: ExecutionContext | undefined,
  failureReason: string,
  logger: Logger
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
        ctx.waitUntil(notifyUsersOfProviderFailure(symbol, env, logger));
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
    logger.error("Failed to fetch from DB during provider failure", dbError);
    return json({ error: "no_price_available" }, 500);
  }
}

/**
 * Send notifications to all registered users about provider failure
 * Runs in background using ctx.waitUntil
 * Uses KV to throttle notifications (max once per 5 minutes per symbol)
 */
async function notifyUsersOfProviderFailure(
  symbol: string,
  env: Env,
  logger: Logger
): Promise<void> {
  try {
    // Throttle notifications using in-memory cache (no KV read/write)
    const throttleKey = `provider_failure:${symbol}:notification_sent`;
    
    // Import throttle cache functions (dynamic import to avoid circular deps)
    const { isThrottled, markThrottled } = await import("./throttle-cache");
    
    if (isThrottled(throttleKey)) {
      logger.debug(`Provider failure notification for ${symbol} throttled`, {
        throttleKey,
      });
      return; // Skip notification - too soon since last one
    }

    // Mark as throttled in cache (no KV write)
    markThrottled(throttleKey);
    
    // Optional: Write to KV for persistence across worker restarts (batched or infrequent)
    // Only write to KV if needed for cross-instance coordination
    // For now, we skip KV writes to reduce operations

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
      logger.info("No registered users to notify about provider failure");
      return;
    }

    const users = rows.results;
    logger.info(`Sending provider failure notifications`, {
      userCount: users.length,
      symbol,
    });

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
          env,
          logger
        );
        logger.info(`Provider failure notification sent`, {
          userId: user.user_id,
          symbol,
        });
      } catch (err) {
        logger.error(`Failed to send provider failure notification`, err, {
          userId: user.user_id,
          symbol,
        });
        // Don't throw - continue with other users
      }
    });

    // Wait for all notifications to complete (or fail silently)
    await Promise.allSettled(notificationPromises);
    logger.info(`Completed sending provider failure notifications`, {
      userCount: users.length,
      symbol,
    });
  } catch (error) {
    logger.error("Failed to send provider failure notifications", error, { symbol });
    // Don't throw - notification failure shouldn't block the response
  }
}
