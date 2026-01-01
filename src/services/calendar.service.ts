/**
 * Calendar Service
 * Service layer with caching logic for calendar events
 */

import type { CalendarRepository, CalendarEvent } from '../repositories/external/CalendarRepository';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { getMarketDataFromKV, setMarketDataToKV, getStaleMarketDataFromKV } from '../api/market-cache';
import { getConfig } from '../api/config';

export class CalendarService {
  constructor(
    private repository: CalendarRepository,
    private env: Env,
    private logger?: Logger
  ) {}

  /**
   * Get earnings calendar with caching
   * Caching: 1 hour (updates daily)
   */
  async getEarningsCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
    const cacheKey = `calendar:earnings:${from || 'all'}:${to || 'all'}`;
    const kv = this.env.marketKv;
    const ttl = 3600; // 1 hour
    const config = await getConfig(this.env);

    // Check KV cache first
    if (kv) {
      const cached = await getMarketDataFromKV(kv, cacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for earnings calendar', {
          cachedAt: cached.cachedAt,
        });
        return cached.data as CalendarEvent[];
      }
    }

    // Cache miss - fetch from repository
    try {
      const data = await this.repository.getEarningsCalendar(from, to);
      
      // Store in cache (non-blocking)
      if (kv) {
        setMarketDataToKV(kv, cacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache earnings calendar', error);
        });
      }
      
      return data;
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        const stale = await getStaleMarketDataFromKV(kv, cacheKey, config);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for earnings calendar');
          return stale.data as CalendarEvent[];
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }

  /**
   * Get dividend calendar with caching
   * Caching: 1 hour
   */
  async getDividendCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
    const cacheKey = `calendar:dividends:${from || 'all'}:${to || 'all'}`;
    const kv = this.env.marketKv;
    const ttl = 3600; // 1 hour
    const config = await getConfig(this.env);

    // Check KV cache first
    if (kv) {
      const cached = await getMarketDataFromKV(kv, cacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for dividend calendar', {
          cachedAt: cached.cachedAt,
        });
        return cached.data as CalendarEvent[];
      }
    }

    // Cache miss - fetch from repository
    try {
      const data = await this.repository.getDividendCalendar(from, to);
      
      // Store in cache (non-blocking)
      if (kv) {
        setMarketDataToKV(kv, cacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache dividend calendar', error);
        });
      }
      
      return data;
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        const stale = await getStaleMarketDataFromKV(kv, cacheKey, config);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for dividend calendar');
          return stale.data as CalendarEvent[];
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }

  /**
   * Get IPO calendar with caching
   * Caching: 1 hour
   */
  async getIPOCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
    const cacheKey = `calendar:ipos:${from || 'all'}:${to || 'all'}`;
    const kv = this.env.marketKv;
    const ttl = 3600; // 1 hour
    const config = await getConfig(this.env);

    // Check KV cache first
    if (kv) {
      const cached = await getMarketDataFromKV(kv, cacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for IPO calendar', {
          cachedAt: cached.cachedAt,
        });
        return cached.data as CalendarEvent[];
      }
    }

    // Cache miss - fetch from repository
    try {
      const data = await this.repository.getIPOCalendar(from, to);
      
      // Store in cache (non-blocking)
      if (kv) {
        setMarketDataToKV(kv, cacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache IPO calendar', error);
        });
      }
      
      return data;
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        const stale = await getStaleMarketDataFromKV(kv, cacheKey, config);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for IPO calendar');
          return stale.data as CalendarEvent[];
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }

  /**
   * Get stock split calendar with caching
   * Caching: 1 hour
   */
  async getStockSplitCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
    const cacheKey = `calendar:splits:${from || 'all'}:${to || 'all'}`;
    const kv = this.env.marketKv;
    const ttl = 3600; // 1 hour
    const config = await getConfig(this.env);

    // Check KV cache first
    if (kv) {
      const cached = await getMarketDataFromKV(kv, cacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for stock split calendar', {
          cachedAt: cached.cachedAt,
        });
        return cached.data as CalendarEvent[];
      }
    }

    // Cache miss - fetch from repository
    try {
      const data = await this.repository.getStockSplitCalendar(from, to);
      
      // Store in cache (non-blocking)
      if (kv) {
        setMarketDataToKV(kv, cacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache stock split calendar', error);
        });
      }
      
      return data;
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        const stale = await getStaleMarketDataFromKV(kv, cacheKey, config);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for stock split calendar');
          return stale.data as CalendarEvent[];
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }
}

