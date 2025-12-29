/**
 * Profile Fetcher
 * Extracted profile fetching logic to improve testability
 */

import { API_KEY, API_URL } from '../../util';
import type { Logger } from '../../logging/logger';

export interface ProfileFetchResult {
  profile: any;
  description: string | null;
}

/**
 * Fetch profile data from multiple endpoints with fallback logic
 * Tries endpoints in order until one succeeds
 */
export async function fetchProfileFromApi(
  symbol: string,
  quote?: any,
  logger?: Logger
): Promise<ProfileFetchResult> {
  let profile = null;
  let profileDescription = null;

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

