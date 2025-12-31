/**
 * News Cache Helper Tests
 * Tests KV cache utilities for news data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { getNewsDataFromKV, setNewsDataToKV } from '../news-cache';
import type { NewsItem, NewsPagination } from '@stockly/shared/types';

describe('News Cache Helper', () => {
  let mockKv: KVNamespace;
  const TTL_SECONDS = 3600; // 1 hour

  beforeEach(() => {
    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as any;
    vi.clearAllMocks();
  });

  describe('getNewsDataFromKV', () => {
    it('should return cached data when cache is valid', async () => {
      // Arrange
      const key = 'news:general:latest';
      const cachedNews: NewsItem[] = [
        {
          title: 'Test News',
          text: 'Test content',
          url: 'https://example.com/news',
          publishedDate: '2024-01-01',
          symbol: null,
        },
      ];
      const pagination: NewsPagination = {
        page: 0,
        limit: 20,
        total: 1,
        hasMore: false,
      };
      const cacheEntry = {
        data: {
          news: cachedNews,
          pagination,
        },
        cachedAt: Date.now() - 600000, // 10 minutes ago (still valid)
        expiresAt: Date.now() + 3000000, // expires in 50 minutes
      };

      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(cacheEntry));

      // Act
      const result = await getNewsDataFromKV(mockKv, key);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.data.news).toEqual(cachedNews);
      expect(result?.data.pagination).toEqual(pagination);
      expect(mockKv.get).toHaveBeenCalledWith(key);
    });

    it('should return null when cache is expired', async () => {
      // Arrange
      const key = 'news:general:latest';
      const cacheEntry = {
        data: {
          news: [],
          pagination: { page: 0, limit: 20, total: 0, hasMore: false },
        },
        cachedAt: Date.now() - 4000000, // 66+ minutes ago
        expiresAt: Date.now() - 100000, // expired 1.6 minutes ago
      };

      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(cacheEntry));

      // Act
      const result = await getNewsDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
      expect(mockKv.get).toHaveBeenCalledWith(key);
    });

    it('should return null when cache does not exist', async () => {
      // Arrange
      const key = 'news:general:latest';
      vi.mocked(mockKv.get).mockResolvedValue(null);

      // Act
      const result = await getNewsDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
      expect(mockKv.get).toHaveBeenCalledWith(key);
    });

    it('should return null when cache entry is invalid JSON', async () => {
      // Arrange
      const key = 'news:general:latest';
      vi.mocked(mockKv.get).mockResolvedValue('invalid json');

      // Act
      const result = await getNewsDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when cache entry is missing required fields', async () => {
      // Arrange
      const key = 'news:general:latest';
      const invalidEntry = {
        data: {
          news: [],
          // missing pagination
        },
        // missing cachedAt and expiresAt
      };
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(invalidEntry));

      // Act
      const result = await getNewsDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when cache entry is missing news array', async () => {
      // Arrange
      const key = 'news:general:latest';
      const invalidEntry = {
        data: {
          pagination: { page: 0, limit: 20, total: 0, hasMore: false },
          // missing news
        },
        cachedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(invalidEntry));

      // Act
      const result = await getNewsDataFromKV(mockKv, key);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('setNewsDataToKV', () => {
    it('should store data in KV with correct TTL metadata', async () => {
      // Arrange
      const key = 'news:general:latest';
      const news: NewsItem[] = [
        {
          title: 'Test News',
          text: 'Test content',
          url: 'https://example.com/news',
          publishedDate: '2024-01-01',
          symbol: null,
        },
      ];
      const pagination: NewsPagination = {
        page: 0,
        limit: 20,
        total: 1,
        hasMore: false,
      };
      const data = { news, pagination };
      const beforeTime = Date.now();

      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      await setNewsDataToKV(mockKv, key, data, TTL_SECONDS);

      // Assert
      expect(mockKv.put).toHaveBeenCalledTimes(1);
      const [putKey, putValue] = vi.mocked(mockKv.put).mock.calls[0];
      expect(putKey).toBe(key);
      
      const storedData = JSON.parse(putValue as string);
      expect(storedData.data.news).toEqual(news);
      expect(storedData.data.pagination).toEqual(pagination);
      expect(storedData.cachedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(storedData.expiresAt).toBeGreaterThan(storedData.cachedAt);
      expect(storedData.expiresAt - storedData.cachedAt).toBe(TTL_SECONDS * 1000);
    });

    it('should handle different TTL values', async () => {
      // Arrange
      const key = 'news:general:latest';
      const data = {
        news: [],
        pagination: { page: 0, limit: 20, total: 0, hasMore: false },
      };
      const customTTL = 1800; // 30 minutes

      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      await setNewsDataToKV(mockKv, key, data, customTTL);

      // Assert
      const [, putValue] = vi.mocked(mockKv.put).mock.calls[0];
      const storedData = JSON.parse(putValue as string);
      expect(storedData.expiresAt - storedData.cachedAt).toBe(customTTL * 1000);
    });

    it('should handle empty array data', async () => {
      // Arrange
      const key = 'news:general:latest';
      const data = {
        news: [],
        pagination: { page: 0, limit: 20, total: 0, hasMore: false },
      };

      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      await setNewsDataToKV(mockKv, key, data, TTL_SECONDS);

      // Assert
      const [, putValue] = vi.mocked(mockKv.put).mock.calls[0];
      const storedData = JSON.parse(putValue as string);
      expect(storedData.data.news).toEqual([]);
    });

    it('should handle large arrays of news', async () => {
      // Arrange
      const key = 'news:general:latest';
      const news: NewsItem[] = Array.from({ length: 50 }, (_, i) => ({
        title: `News ${i}`,
        text: `Content ${i}`,
        url: `https://example.com/news/${i}`,
        publishedDate: '2024-01-01',
        symbol: null,
      }));
      const data = {
        news,
        pagination: { page: 0, limit: 20, total: 50, hasMore: true },
      };

      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      await setNewsDataToKV(mockKv, key, data, TTL_SECONDS);

      // Assert
      const [, putValue] = vi.mocked(mockKv.put).mock.calls[0];
      const storedData = JSON.parse(putValue as string);
      expect(storedData.data.news.length).toBe(50);
      expect(storedData.data.news[0].title).toBe('News 0');
      expect(storedData.data.news[49].title).toBe('News 49');
    });

    it('should not throw when KV write fails', async () => {
      // Arrange
      const key = 'news:general:latest';
      const data = {
        news: [],
        pagination: { page: 0, limit: 20, total: 0, hasMore: false },
      };

      vi.mocked(mockKv.put).mockRejectedValue(new Error('KV write failed'));

      // Act & Assert
      await expect(setNewsDataToKV(mockKv, key, data, TTL_SECONDS)).resolves.not.toThrow();
    });
  });
});

