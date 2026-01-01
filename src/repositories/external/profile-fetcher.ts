/**
 * Profile Fetcher
 * Extracted profile fetching logic to improve testability
 */

import { API_KEY } from '../../util';
import type { Logger } from '../../logging/logger';
import type { DatalakeAdapter } from '../../infrastructure/datalake/DatalakeAdapter';

export interface ProfileFetchResult {
  profile: any;
  description: string | null;
}

/**
 * Fetch profile data from multiple endpoints with fallback logic
 * Tries endpoints in order until one succeeds
 * Optionally uses DatalakeAdapter if provided
 */
export async function fetchProfileFromApi(
  symbol: string,
  quote?: any,
  logger?: Logger,
  adapter?: DatalakeAdapter | null
): Promise<ProfileFetchResult> {
  let profile = null;
  let profileDescription = null;

  // Try adapter first if provided
  if (adapter) {
    const endpointPaths = ['/profile', '/profile/{symbol}', '/company/profile/{symbol}', '/v3/profile/{symbol}'];
    for (const path of endpointPaths) {
      try {
        const params: Record<string, string> = path.includes('{symbol}') ? { symbol } : { symbol };
        const profileData = await adapter.fetch(path, params);

        // Skip empty arrays
        if (Array.isArray(profileData) && profileData.length === 0) {
          continue;
        }

        const fetchedProfile = Array.isArray(profileData) && profileData.length > 0 
          ? profileData[0] 
          : profileData;

        // Skip error responses
        if (fetchedProfile && fetchedProfile['Error Message']) {
          continue;
        }

        // Validate profile has symbol
        if (fetchedProfile && (fetchedProfile.symbol || fetchedProfile.Symbol)) {
          profile = fetchedProfile;
          const desc = fetchedProfile.description || fetchedProfile.Description || fetchedProfile.descriptionText;
          if (desc) {
            profileDescription = desc;
            break; // Found description, stop trying endpoints
          }
          break; // Found profile, stop trying endpoints
        }
      } catch (error) {
        logger?.warn(`Failed to fetch profile from ${path} via adapter`, error);
        continue;
      }
    }
  }

  // Fallback to direct FMP if adapter didn't work or wasn't provided
  if (!profile) {
    const { API_URL, API_KEY } = await import('../../util');
    const profileEndpoints = [
      `${API_URL}/profile?symbol=${symbol}&apikey=${API_KEY}`,
      `${API_URL}/profile/${symbol}?apikey=${API_KEY}`,
      `${API_URL}/company/profile/${symbol}?apikey=${API_KEY}`,
      `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${API_KEY}`,
    ];

    // Try each profile endpoint until one succeeds
    for (const profileApi of profileEndpoints) {
      try {
        const profileRes = await fetch(profileApi, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (profileRes.ok) {
          const profileData = await profileRes.json();

          // Skip empty arrays
          if (Array.isArray(profileData) && profileData.length === 0) {
            continue;
          }

          const fetchedProfile = Array.isArray(profileData) && profileData.length > 0 
            ? profileData[0] 
            : profileData;

          // Skip error responses
          if (fetchedProfile && fetchedProfile['Error Message']) {
            continue;
          }

          // Validate profile has symbol
          if (fetchedProfile && (fetchedProfile.symbol || fetchedProfile.Symbol)) {
            profile = fetchedProfile;
            const desc = fetchedProfile.description || fetchedProfile.Description || fetchedProfile.descriptionText;
            if (desc) {
              profileDescription = desc;
              break; // Found description, stop trying endpoints
            }
            break; // Found profile, stop trying endpoints
          }
        }
      } catch (error) {
        logger?.warn(`Failed to fetch profile from ${profileApi}`, error);
        // Continue to next endpoint
      }
    }
  }

  const quoteDescription = quote?.description || null;

  // Ensure profile has image
  if (!profile || !profile.image) {
    profile = {
      ...profile,
      image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png`,
    };
  }

  // Try Wikipedia as fallback for description
  let wikipediaDescription = null;
  if (!profileDescription && !quoteDescription) {
    try {
      const companyName = quote?.name || quote?.companyName || profile?.name || profile?.companyName || symbol;
      const wikiSearchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(companyName)}`;
      const wikiRes = await fetch(wikiSearchUrl);

      if (wikiRes.ok) {
        const wikiData = await wikiRes.json() as { extract?: string };
        if (wikiData.extract) {
          wikipediaDescription = wikiData.extract;
        }
      }
    } catch (wikiError) {
      logger?.warn(`Failed to fetch from Wikipedia`, wikiError);
    }
  }

  const finalDescription = profileDescription || quoteDescription || profile?.description || wikipediaDescription || null;

  return {
    profile: profile || { image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png` },
    description: finalDescription,
  };
}

