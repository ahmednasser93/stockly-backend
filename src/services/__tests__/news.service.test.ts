/**
 * News Service Tests
 * Tests service layer caching logic for news
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewsService } from '../news.service';
import type { INewsRepository } from '../../repositories/interfaces/INewsRepository';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import { getNewsDataFromKV, setNewsDataToKV, getStaleNewsDataFromKV } from '../../api/news-cache';
import { getConfig } from '../../api/config';
import { isWithinWorkingHours } from '../../utils/working-hours';
import type { NewsItem, NewsPagination } from '@stockly/shared/types';

// Mock dependencies
vi.mock('../../api/news-cache', () => ({
  getNewsDataFromKV: vi.fn(),
  setNewsDataToKV: vi.fn(),
  getStaleNewsDataFromKV: vi.fn(),
}));

vi.mock('../../api/config', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../utils/working-hours', () => ({
  isWithinWorkingHours: vi.fn(),
}));

describe('NewsService', () => {
  let service: NewsService;
  let mockRepository: INewsRepository;
  let mockEnv: Env;
  let mockLogger: Logger;
  let mockKv: any;

  beforeEach(() => {
    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
    };

    mockEnv = {
      stockly: {} as any,
      alertsKv: mockKv,
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockRepository = {
      getGeneralNews: vi.fn(),
      getNews: vi.fn(),
      getStockNews: vi.fn(),
    } as any;

    service = new NewsService(mockRepository, mockEnv, mockLogger);
    vi.clearAllMocks();

    // Default config mock
    vi.mocked(getConfig).mockResolvedValue({
      pollingIntervalSec: 30,
      kvWriteIntervalSec: 3600,
      primaryProvider: 'alpha-feed',
      backupProvider: 'beta-feed',
      alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
      marketCache: {
        marketDataTtlSec: 300,
        sectorsTtlSec: 2700,
        newsTtlSec: 3600,
        prefetchCronInterval: '0 * * * *',
      },
      workingHours: {
        enabled: true,
        startHour: 10,
        endHour: 23,
        timezone: 'Europe/Madrid',
      },
      featureFlags: {
        alerting: true,
        sandboxMode: false,
        simulateProviderFailure: false,
      },
    } as any);
    vi.mocked(isWithinWorkingHours).mockReturnValue(true);
  });

  describe('getGeneralNews', () => {
    it('should return cached data when KV cache hit (first page)', async () => {
      // Arrange
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

      vi.mocked(getNewsDataFromKV).mockResolvedValue({
        data: { news: cachedNews, pagination },
        cachedAt: Date.now(),
      });

      // Act
      const result = await service.getGeneralNews();

      // Assert
      expect(result.news).toEqual(cachedNews);
      expect(result.pagination).toEqual(pagination);
      expect(getNewsDataFromKV).toHaveBeenCalledWith(mockKv, 'news:general:latest', expect.any(Object));
      expect(mockRepository.getGeneralNews).not.toHaveBeenCalled();
      expect(setNewsDataToKV).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cache hit for general news',
        expect.objectContaining({ cachedAt: expect.any(Number) })
      );
    });

    it('should fetch from repository and cache when KV cache miss (first page)', async () => {
      // Arrange
      const freshNews: NewsItem[] = [
        {
          title: 'Fresh News',
          text: 'Fresh content',
          url: 'https://example.com/fresh',
          publishedDate: '2024-01-02',
          symbol: null,
        },
      ];
      const pagination: NewsPagination = {
        page: 0,
        limit: 20,
        total: 1,
        hasMore: false,
      };

      vi.mocked(getNewsDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getGeneralNews).mockResolvedValue({
        news: freshNews,
        pagination,
      });
      vi.mocked(setNewsDataToKV).mockResolvedValue(undefined);

      // Act
      const result = await service.getGeneralNews();

      // Assert
      expect(result.news).toEqual(freshNews);
      expect(result.pagination).toEqual(pagination);
      expect(getNewsDataFromKV).toHaveBeenCalledWith(mockKv, 'news:general:latest', expect.any(Object));
      expect(mockRepository.getGeneralNews).toHaveBeenCalledWith(undefined);
      expect(setNewsDataToKV).toHaveBeenCalledWith(
        mockKv,
        'news:general:latest',
        { news: freshNews, pagination },
        expect.any(Object),
        3600
      );
    });

    it('should use configurable TTL from AdminConfig', async () => {
      // Arrange
      const customTTL = 1800; // 30 minutes
      vi.mocked(getConfig).mockResolvedValue({
        marketCache: { newsTtlSec: customTTL },
      } as any);
      vi.mocked(getNewsDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getGeneralNews).mockResolvedValue({
        news: [],
        pagination: { page: 0, limit: 20, total: 0, hasMore: false },
      });
      vi.mocked(setNewsDataToKV).mockResolvedValue(undefined);

      // Act
      await service.getGeneralNews();

      // Assert
      expect(setNewsDataToKV).toHaveBeenCalledWith(
        mockKv,
        'news:general:latest',
        expect.any(Object),
        expect.objectContaining({
          marketCache: expect.objectContaining({
            newsTtlSec: customTTL,
          }),
        }),
        customTTL
      );
    });

    it('should return stale cache when FMP API fails', async () => {
      // Arrange
      const staleNews: NewsItem[] = [
        {
          title: 'Stale News',
          text: 'Stale content',
          url: 'https://example.com/stale',
          publishedDate: '2024-01-01',
          symbol: null,
        },
      ];
      const stalePagination: NewsPagination = {
        page: 0,
        limit: 20,
        total: 1,
        hasMore: false,
      };

      vi.mocked(getNewsDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getGeneralNews).mockRejectedValue(new Error('FMP API failed'));
      vi.mocked(getStaleNewsDataFromKV).mockResolvedValue({
        data: { news: staleNews, pagination: stalePagination },
        cachedAt: Date.now() - 7200000, // 2 hours ago (expired but still usable as stale)
      });

      // Act
      const result = await service.getGeneralNews();

      // Assert
      expect(result.news).toEqual(staleNews);
      expect(result.pagination).toEqual(stalePagination);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'FMP API failed, returning stale cache for general news'
      );
    });

    it('should not cache when fetching non-first page', async () => {
      // Arrange
      const options = { page: 1, limit: 20 };
      const news: NewsItem[] = [];
      const pagination: NewsPagination = {
        page: 1,
        limit: 20,
        total: 0,
        hasMore: false,
      };

      vi.mocked(mockRepository.getGeneralNews).mockResolvedValue({ news, pagination });

      // Act
      const result = await service.getGeneralNews(options);

      // Assert
      expect(result.news).toEqual(news);
      expect(getNewsDataFromKV).not.toHaveBeenCalled();
      expect(setNewsDataToKV).not.toHaveBeenCalled();
      expect(mockRepository.getGeneralNews).toHaveBeenCalledWith(options);
    });

    it('should rethrow error when both FMP and cache fail', async () => {
      // Arrange
      const error = new Error('FMP API failed');
      vi.mocked(getNewsDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getGeneralNews).mockRejectedValue(error);
      vi.mocked(getStaleNewsDataFromKV).mockResolvedValue(null); // No stale cache

      // Act & Assert
      await expect(service.getGeneralNews()).rejects.toThrow('FMP API failed');
    });

    it('should work without Env (no caching)', async () => {
      // Arrange
      const serviceWithoutEnv = new NewsService(mockRepository);
      const news: NewsItem[] = [];
      const pagination: NewsPagination = {
        page: 0,
        limit: 20,
        total: 0,
        hasMore: false,
      };

      vi.mocked(mockRepository.getGeneralNews).mockResolvedValue({ news, pagination });

      // Act
      const result = await serviceWithoutEnv.getGeneralNews();

      // Assert
      expect(result.news).toEqual(news);
      expect(getNewsDataFromKV).not.toHaveBeenCalled();
      expect(setNewsDataToKV).not.toHaveBeenCalled();
    });

    it('should handle cache write failures gracefully', async () => {
      // Arrange
      const news: NewsItem[] = [];
      const pagination: NewsPagination = {
        page: 0,
        limit: 20,
        total: 0,
        hasMore: false,
      };

      vi.mocked(getNewsDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getGeneralNews).mockResolvedValue({ news, pagination });
      vi.mocked(setNewsDataToKV).mockRejectedValue(new Error('KV write failed'));

      // Act
      const result = await service.getGeneralNews();

      // Assert
      expect(result.news).toEqual(news);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to cache general news',
        expect.any(Error)
      );
    });

    it('should return stale cache when outside working hours', async () => {
      // Arrange
      const staleNews: NewsItem[] = [
        {
          title: 'Stale News',
          text: 'Stale content',
          url: 'https://example.com/stale',
          publishedDate: '2024-01-01',
          symbol: null,
        },
      ];
      const stalePagination: NewsPagination = {
        page: 0,
        limit: 20,
        total: 1,
        hasMore: false,
      };

      vi.mocked(getNewsDataFromKV).mockResolvedValue(null);
      vi.mocked(isWithinWorkingHours).mockReturnValue(false); // Outside working hours
      vi.mocked(getStaleNewsDataFromKV).mockResolvedValue({
        data: { news: staleNews, pagination: stalePagination },
        cachedAt: Date.now() - 7200000,
      });

      // Act
      const result = await service.getGeneralNews();

      // Assert
      expect(result.news).toEqual(staleNews);
      expect(result.pagination).toEqual(stalePagination);
      expect(mockLogger?.info).toHaveBeenCalledWith(
        expect.stringContaining('Outside working hours, returning stale cache'),
        expect.any(Object)
      );
      expect(mockRepository.getGeneralNews).not.toHaveBeenCalled();
    });

    it('should return empty result when outside working hours and no cache', async () => {
      // Arrange
      vi.mocked(getNewsDataFromKV).mockResolvedValue(null);
      vi.mocked(isWithinWorkingHours).mockReturnValue(false);
      vi.mocked(getStaleNewsDataFromKV).mockResolvedValue(null);

      // Act
      const result = await service.getGeneralNews();

      // Assert
      expect(result.news).toEqual([]);
      expect(result.pagination).toEqual({
        page: 0,
        limit: 20,
        total: 0,
        hasMore: false,
      });
      expect(mockLogger?.warn).toHaveBeenCalledWith(
        'Outside working hours and no cache available for general news'
      );
      expect(mockRepository.getGeneralNews).not.toHaveBeenCalled();
    });
  });
});

