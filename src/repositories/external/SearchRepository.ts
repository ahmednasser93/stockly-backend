import type { ISearchRepository } from '../interfaces/ISearchRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { StockSearchResult } from '@stockly/shared/types';
import { API_KEY, API_URL } from '../../util';
import { getCache, setCache } from '../../api/cache';
import type { Logger } from '../../logging/logger';

const DB_CACHE_TTL_SECONDS = 20 * 60;

type CachedSearchRow = {
  results: string;
  timestamp: number;
};

/**
 * Calculate match score for ranking search results
 * Higher score = better match
 * Prioritizes exact matches (both symbol and name) equally
 */
function calculateMatchScore(query: string, item: any): number {
  const q = query.toLowerCase().trim();
  const symbol = (item.symbol || '').toLowerCase();
  const name = (item.name || '').toLowerCase();

  let score = 0;

  // Exact matches (highest priority - both symbol and name get same priority)
  if (symbol === q) score += 1000; // Exact symbol match
  if (name === q) score += 1000; // Exact name match

  // If query matches symbol exactly, boost it significantly
  if (symbol === q) {
    score += 500; // Extra boost for exact symbol match
  }

  // Starts with (high priority)
  if (symbol.startsWith(q)) score += 800; // Symbol starts with query
  if (name.startsWith(q)) score += 750; // Name starts with query

  // Contains (medium priority)
  if (symbol.includes(q)) score += 400; // Symbol contains query
  if (name.includes(q)) score += 350; // Name contains query

  // Word boundaries in name (bonus for partial name matches)
  const nameWords = name.split(/\s+/);
  const queryWords = q.split(/\s+/);
  const matchedWords = queryWords.filter((qw) => nameWords.some((nw) => nw.startsWith(qw))).length;
  score += matchedWords * 50;

  // Bonus: If query is short (likely a symbol), prioritize symbol matches
  if (q.length <= 5 && symbol.startsWith(q)) {
    score += 200; // Extra boost for short queries matching symbol
  }

  // Bonus: If query matches company name (likely a name search), prioritize name matches
  if (q.length > 5 && name.includes(q)) {
    score += 150; // Extra boost for longer queries matching name
  }

  return score;
}

export class SearchRepository implements ISearchRepository {
  constructor(private db: IDatabase, private logger: Logger, private env: any) {}

  private async getDbCachedResults(query: string): Promise<any[] | null> {
    try {
      const row = await this.db
        .prepare(
          `SELECT results, timestamp
           FROM search_cache
           WHERE query = ?
           ORDER BY timestamp DESC
           LIMIT 1`
        )
        .bind(query)
        .first<CachedSearchRow>();

      if (!row) return null;

      const ageSeconds = Math.floor(Date.now() / 1000) - Number(row.timestamp ?? 0);
      if (ageSeconds >= DB_CACHE_TTL_SECONDS) {
        return null;
      }

      const parsed = JSON.parse(row.results);
      return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      this.logger.error('Failed to read search cache', error);
      return null;
    }
  }

  private async persistSearchResults(query: string, results: any[]): Promise<void> {
    try {
      await this.db
        .prepare(`INSERT INTO search_cache (query, results, timestamp) VALUES (?, ?, ?)`)
        .bind(query, JSON.stringify(results), Math.floor(Date.now() / 1000))
        .run();
    } catch (error) {
      this.logger.error('Failed to persist search cache', error);
    }
  }

  async searchStocks(query: string): Promise<StockSearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const normalizedQuery = query.toLowerCase();
    const cacheKey = `search:${normalizedQuery}`;

    // Check memory cache
    const memoryCached = getCache(cacheKey);
    if (memoryCached) {
      return memoryCached as StockSearchResult[];
    }

    // Check database cache
    const dbCached = await this.getDbCachedResults(normalizedQuery);
    if (dbCached) {
      setCache(cacheKey, dbCached, DB_CACHE_TTL_SECONDS);
      return dbCached as StockSearchResult[];
    }

    try {
      const apiKey = this.env.FMP_API_KEY ?? API_KEY;

      // Use /search-name endpoint for company name searches
      // Fallback to /search-symbol for symbol searches
      const nameApi = `${API_URL}/search-name?query=${encodeURIComponent(query)}&limit=20&apikey=${apiKey}`;
      const symbolApi = `${API_URL}/search-symbol?query=${encodeURIComponent(query)}&limit=20&apikey=${apiKey}`;

      // Fetch from both endpoints in parallel
      const [nameRes, symbolRes] = await Promise.all([
        fetch(nameApi).catch(() => null),
        fetch(symbolApi).catch(() => null),
      ]);

      let combinedData: any[] = [];

      // Parse /search-name results
      if (nameRes && nameRes.ok) {
        try {
          const nameData = await nameRes.json();
          if (Array.isArray(nameData) && nameData.length > 0) {
            combinedData.push(...nameData);
          }
        } catch (e) {
          this.logger.warn('Failed to parse /search-name response', e);
        }
      }

      // Parse /search-symbol results
      if (symbolRes && symbolRes.ok) {
        try {
          const symbolData = await symbolRes.json();
          if (Array.isArray(symbolData) && symbolData.length > 0) {
            combinedData.push(...symbolData);
          }
        } catch (e) {
          this.logger.warn('Failed to parse /search-symbol response', e);
        }
      }

      if (combinedData.length === 0) {
        return [];
      }

      // Process, rank, and deduplicate results
      const results = combinedData
        .map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          currency: item.currency,
          stockExchange: item.stockExchange,
          matchScore: calculateMatchScore(query, item),
        }))
        // Remove duplicates by symbol (keep first occurrence)
        .filter((item, index, self) => index === self.findIndex((t) => t.symbol === item.symbol))
        // Sort by relevance
        .sort((a, b) => b.matchScore - a.matchScore)
        // Limit to top 10 results
        .slice(0, 10)
        // Remove match score from response
        .map(({ matchScore, ...item }) => item) as StockSearchResult[];

      // Cache results
      setCache(cacheKey, results, DB_CACHE_TTL_SECONDS);
      await this.persistSearchResults(normalizedQuery, results);

      return results;
    } catch (err) {
      this.logger.error('Search error', err);
      throw new Error('Failed to search stocks');
    }
  }
}

