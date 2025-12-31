/**
 * Market Cache Helper Tests
 * Tests KV cache utilities for market data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { getMarketDataFromKV, setMarketDataToKV } from '../market-cache';
import type { MarketStockItem } from '@stockly/shared/types';

describe('Market Cache Helper', () => {
  let mockKv: KVNamespace;
  const TTL_SECONDS = 300; // 5 minutes

  beforeEach(() => {
    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as any;
    vi.clearAllMocks();
  });

  describe('getMarketDataFromKV', () => {
    it('should return cached data when cache is valid', async () => {
      // Arrange
      const key = 'market:gainers';
      const cachedData: MarketStockItem[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
        },
      ];
      const cacheEntry = {
        data: cachedData,
        cachedAt: Date.now() - 60000, // 1 minute ago (still valid)
        expiresAt: Date.now() + 240000, // expires in 4 minutes
      };

      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(cacheEntry));

      // Act
      const result = await getMarketDataFromKV(mockKv, key);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.data).toEqual(cachedData);
      expect(mockKv.get).toHaveBeenCalledWith(key);
    });

    it('should return null when cache is expired', async () => {
      // Arrange
      const key = 'market:gainers';
      const cacheEntry = {
        data: [],
        cachedAt: Date.now() - 400000, // 6+ minutes ago
        expiresAt: Date.now() - 100000, // expired 1.6 minutes ago
      };

      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(cacheEntry));

      // Act
      const result = await getMarketDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
      expect(mockKv.get).toHaveBeenCalledWith(key);
    });

    it('should return null when cache does not exist', async () => {
      // Arrange
      const key = 'market:gainers';
      vi.mocked(mockKv.get).mockResolvedValue(null);

      // Act
      const result = await getMarketDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
      expect(mockKv.get).toHaveBeenCalledWith(key);
    });

    it('should return null when cache entry is invalid JSON', async () => {
      // Arrange
      const key = 'market:gainers';
      vi.mocked(mockKv.get).mockResolvedValue('invalid json');

      // Act
      const result = await getMarketDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when cache entry is missing required fields', async () => {
      // Arrange
      const key = 'market:gainers';
      const invalidEntry = {
        data: [],
        // missing cachedAt and expiresAt
      };
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(invalidEntry));

      // Act
      const result = await getMarketDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('setMarketDataToKV', () => {
    it('should store data in KV with correct TTL metadata', async () => {
      // Arrange
      const key = 'market:gainers';
      const data: MarketStockItem[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
        },
      ];
      const beforeTime = Date.now();

      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      await setMarketDataToKV(mockKv, key, data, TTL_SECONDS);

      // Assert
      expect(mockKv.put).toHaveBeenCalledTimes(1);
      const [putKey, putValue] = vi.mocked(mockKv.put).mock.calls[0];
      expect(putKey).toBe(key);
      
      const storedData = JSON.parse(putValue as string);
      expect(storedData.data).toEqual(data);
      expect(storedData.cachedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(storedData.expiresAt).toBeGreaterThan(storedData.cachedAt);
      expect(storedData.expiresAt - storedData.cachedAt).toBe(TTL_SECONDS * 1000);
    });

    it('should handle different TTL values', async () => {
      // Arrange
      const key = 'market:gainers';
      const data: MarketStockItem[] = [];
      const customTTL = 600; // 10 minutes

      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      await setMarketDataToKV(mockKv, key, data, customTTL);

      // Assert
      const [, putValue] = vi.mocked(mockKv.put).mock.calls[0];
      const storedData = JSON.parse(putValue as string);
      expect(storedData.expiresAt - storedData.cachedAt).toBe(customTTL * 1000);
    });

    it('should handle empty array data', async () => {
      // Arrange
      const key = 'market:gainers';
      const data: MarketStockItem[] = [];

      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      await setMarketDataToKV(mockKv, key, data, TTL_SECONDS);

      // Assert
      const [, putValue] = vi.mocked(mockKv.put).mock.calls[0];
      const storedData = JSON.parse(putValue as string);
      expect(storedData.data).toEqual([]);
    });

    it('should handle large arrays of data', async () => {
      // Arrange
      const key = 'market:gainers';
      const data: MarketStockItem[] = Array.from({ length: 50 }, (_, i) => ({
        symbol: `STOCK${i}`,
        name: `Stock ${i}`,
        price: 100 + i,
      }));

      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      await setMarketDataToKV(mockKv, key, data, TTL_SECONDS);

      // Assert
      const [, putValue] = vi.mocked(mockKv.put).mock.calls[0];
      const storedData = JSON.parse(putValue as string);
      expect(storedData.data.length).toBe(50);
      expect(storedData.data[0].symbol).toBe('STOCK0');
      expect(storedData.data[49].symbol).toBe('STOCK49');
    });
  });
});


