import { getCache, setCache } from "./cache";
import type { Env } from "../index";
import { API_KEY, API_URL, json } from "../util";
import { fetchAndSaveHistoricalPrice } from "./historical-prices";

export async function getStock(url: URL, env: Env, ctx?: ExecutionContext): Promise<Response> {
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
    return json({ error: "failed to fetch stock" }, 500);
  }
}
