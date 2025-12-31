/**
 * Market Service Tests
 * Tests service layer caching logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketService } from '../market.service';
import type { MarketRepository } from '../../repositories/external/MarketRepository';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import { getMarketDataFromKV, setMarketDataToKV, getSectorsDataFromKV, setSectorsDataToKV, getStaleMarketDataFromKV, getStaleSectorsDataFromKV } from '../../api/market-cache';
import { getConfig } from '../../api/config';
import { isWithinWorkingHours } from '../../utils/working-hours';
import { createCommonStocksService } from '../../factories/createCommonStocksService';
import type { MarketStockItem, SectorPerformanceItem } from '@stockly/shared/types';

// Mock dependencies
vi.mock('../../api/market-cache', () => ({
  getMarketDataFromKV: vi.fn(),
  setMarketDataToKV: vi.fn(),
  getSectorsDataFromKV: vi.fn(),
  setSectorsDataToKV: vi.fn(),
  getStaleMarketDataFromKV: vi.fn(),
  getStaleSectorsDataFromKV: vi.fn(),
}));

vi.mock('../../api/config', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../utils/working-hours', () => ({
  isWithinWorkingHours: vi.fn(),
}));

vi.mock('../../factories/createCommonStocksService', () => ({
  createCommonStocksService: vi.fn(),
}));

describe('MarketService', () => {
  let service: MarketService;
  let mockRepository: MarketRepository;
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
      marketKv: mockKv,
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockRepository = {
      getGainers: vi.fn(),
      getLosers: vi.fn(),
      getActives: vi.fn(),
      getSectorsPerformance: vi.fn(),
      fetchPricesForStocks: vi.fn(),
    } as any;

    service = new MarketService(mockRepository, mockEnv, mockLogger);
    vi.clearAllMocks();
    
    // Default mocks - working hours enabled, within hours
    vi.mocked(getConfig).mockResolvedValue({
      pollingIntervalSec: 30,
      kvWriteIntervalSec: 3600,
      primaryProvider: 'alpha-feed',
      backupProvider: 'beta-feed',
      alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
      marketCache: {
        marketDataTtlSec: 300,
        sectorsTtlSec: 2700,
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

  describe('getGainers', () => {
    it('should return cached data when KV cache hit', async () => {
      // Arrange
      const cachedData: MarketStockItem[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
        },
        {
          symbol: 'MSFT',
          name: 'Microsoft Corp.',
          price: 300.0,
          change: 2.0,
          changesPercentage: 0.67,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue({
        data: cachedData,
        cachedAt: Date.now(),
      });

      // Act
      const result = await service.getGainers();

      // Assert
      // Should return first 10 items (default limit)
      expect(result).toEqual(cachedData.slice(0, 10));
      expect(getMarketDataFromKV).toHaveBeenCalledWith(mockKv, 'market:gainers:top50');
      expect(mockRepository.getGainers).not.toHaveBeenCalled();
      expect(setMarketDataToKV).not.toHaveBeenCalled();
    });

    it('should fetch from FMP and cache when KV cache miss', async () => {
      // Arrange
      const freshData: MarketStockItem[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
        },
        {
          symbol: 'MSFT',
          name: 'Microsoft Corp.',
          price: 300.0,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getGainers).mockResolvedValue(freshData);
      vi.mocked(setMarketDataToKV).mockResolvedValue(undefined);

      // Act
      const result = await service.getGainers();

      // Assert
      // Should return first 10 items (default limit)
      expect(result).toEqual(freshData.slice(0, 10));
      expect(getMarketDataFromKV).toHaveBeenCalledWith(mockKv, 'market:gainers:top50');
      expect(mockRepository.getGainers).toHaveBeenCalledTimes(1);
      // Should cache the full list, not the limited list
      expect(setMarketDataToKV).toHaveBeenCalledWith(
        mockKv,
        'market:gainers:top50',
        freshData,
        300
      );
    });

    it('should fetch from FMP and cache when KV cache expired', async () => {
      // Arrange
      const freshData: MarketStockItem[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue(null); // Expired cache
      vi.mocked(mockRepository.getGainers).mockResolvedValue(freshData);
      vi.mocked(setMarketDataToKV).mockResolvedValue(undefined);

      // Act
      const result = await service.getGainers();

      // Assert
      expect(result).toEqual(freshData);
      expect(mockRepository.getGainers).toHaveBeenCalledTimes(1);
      expect(setMarketDataToKV).toHaveBeenCalled();
    });

    it('should return stale cache when FMP API fails', async () => {
      // Arrange
      const staleData: MarketStockItem[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
        },
        {
          symbol: 'MSFT',
          name: 'Microsoft Corp.',
          price: 300.0,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue(null); // Cache miss/expired
      vi.mocked(mockRepository.getGainers).mockRejectedValue(new Error('FMP API error'));
      // Mock stale cache using new function
      vi.mocked(getStaleMarketDataFromKV).mockResolvedValue({
        data: staleData,
        cachedAt: Date.now() - 400000, // Very old
      });

      // Act
      const result = await service.getGainers();

      // Assert
      // Should return first 10 items from stale cache
      expect(result).toEqual(staleData.slice(0, 10));
      expect(getStaleMarketDataFromKV).toHaveBeenCalledWith(mockKv, 'market:gainers:full');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return empty array when FMP fails and no stale cache available', async () => {
      // Arrange
      vi.mocked(getMarketDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getGainers).mockRejectedValue(new Error('FMP API error'));
      vi.mocked(getStaleMarketDataFromKV).mockResolvedValue(null); // No stale cache

      // Act
      const result = await service.getGainers();

      // Assert
      expect(result).toEqual([]);
      expect(mockLogger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('FMP endpoint failed for gainers, trying 500-stock calculation fallback'),
        expect.any(Object)
      );
    });

    it('should return stale cache when outside working hours and no fresh cache', async () => {
      // Arrange
      const staleData: MarketStockItem[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
        },
        {
          symbol: 'MSFT',
          name: 'Microsoft Corp.',
          price: 300.0,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue(null); // No fresh cache
      vi.mocked(isWithinWorkingHours).mockReturnValue(false); // Outside working hours
      vi.mocked(mockRepository.getGainers).mockRejectedValue(new Error('FMP API error')); // FMP fails
      vi.mocked(getStaleMarketDataFromKV).mockResolvedValue({
        data: staleData,
        cachedAt: Date.now() - 7200000, // 2 hours ago
      });

      // Act
      const result = await service.getGainers();

      // Assert
      // Should return first 10 items from stale cache
      expect(result).toEqual(staleData.slice(0, 10));
      expect(getStaleMarketDataFromKV).toHaveBeenCalledWith(mockKv, 'market:gainers:full');
      expect(mockLogger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Using stale cache for gainers as last resort'),
        expect.any(Object)
      );
      expect(mockRepository.getGainers).toHaveBeenCalled(); // Should try FMP first
    });

    it('should return empty array when outside working hours and no cache available', async () => {
      // Arrange
      vi.mocked(getMarketDataFromKV).mockResolvedValue(null);
      vi.mocked(isWithinWorkingHours).mockReturnValue(false);
      vi.mocked(mockRepository.getGainers).mockRejectedValue(new Error('FMP API error')); // FMP fails
      vi.mocked(getStaleMarketDataFromKV).mockResolvedValue(null); // No stale cache
      // Mock the fallback calculation to also fail
      vi.mocked(createCommonStocksService).mockReturnValue({
        getAllActiveStocks: vi.fn().mockRejectedValue(new Error('Database error')),
      } as any);
      vi.mocked(mockRepository.fetchPricesForStocks).mockResolvedValue([]);

      // Act
      const result = await service.getGainers();

      // Assert
      expect(result).toEqual([]);
      expect(mockLogger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('FMP endpoint failed for gainers, trying 500-stock calculation fallback'),
        expect.any(Object)
      );
      expect(mockRepository.getGainers).toHaveBeenCalled(); // Should try FMP first
    });
  });

  describe('getLosers', () => {
    it('should return cached data when KV cache hit', async () => {
      // Arrange
      const cachedData: MarketStockItem[] = [
        {
          symbol: 'STOCK1',
          name: 'Losing Stock',
          price: 50.0,
          change: -5.0,
          changesPercentage: -9.09,
        },
        {
          symbol: 'STOCK2',
          name: 'Another Losing Stock',
          price: 30.0,
          change: -3.0,
          changesPercentage: -9.09,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue({
        data: cachedData,
        cachedAt: Date.now(),
      });

      // Act
      const result = await service.getLosers();

      // Assert
      expect(result).toEqual(cachedData.slice(0, 10));
      expect(getMarketDataFromKV).toHaveBeenCalledWith(mockKv, 'market:losers:top50');
      expect(mockRepository.getLosers).not.toHaveBeenCalled();
    });

    it('should fetch from FMP and cache when KV cache miss', async () => {
      // Arrange
      const freshData: MarketStockItem[] = [
        {
          symbol: 'STOCK1',
          name: 'Losing Stock',
          price: 50.0,
        },
        {
          symbol: 'STOCK2',
          name: 'Another Losing Stock',
          price: 30.0,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getLosers).mockResolvedValue(freshData);
      vi.mocked(setMarketDataToKV).mockResolvedValue(undefined);

      // Act
      const result = await service.getLosers();

      // Assert
      expect(result).toEqual(freshData.slice(0, 10));
      expect(mockRepository.getLosers).toHaveBeenCalledTimes(1);
      expect(setMarketDataToKV).toHaveBeenCalledWith(
        mockKv,
        'market:losers:top50',
        freshData,
        300
      );
    });
  });

  describe('getActives', () => {
    it('should return cached data when KV cache hit', async () => {
      // Arrange
      const cachedData: MarketStockItem[] = [
        {
          symbol: 'ACTIVE1',
          name: 'Active Stock',
          price: 100.0,
          volume: 5000000,
        },
        {
          symbol: 'ACTIVE2',
          name: 'Another Active Stock',
          price: 200.0,
          volume: 3000000,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue({
        data: cachedData,
        cachedAt: Date.now(),
      });

      // Act
      const result = await service.getActives();

      // Assert
      expect(result).toEqual(cachedData.slice(0, 10));
      expect(getMarketDataFromKV).toHaveBeenCalledWith(mockKv, 'market:actives:top50');
      expect(mockRepository.getActives).not.toHaveBeenCalled();
    });

    it('should fetch from FMP and cache when KV cache miss', async () => {
      // Arrange
      const freshData: MarketStockItem[] = [
        {
          symbol: 'ACTIVE1',
          name: 'Active Stock',
          price: 100.0,
        },
        {
          symbol: 'ACTIVE2',
          name: 'Another Active Stock',
          price: 200.0,
        },
      ];

      vi.mocked(getMarketDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getActives).mockResolvedValue(freshData);
      vi.mocked(setMarketDataToKV).mockResolvedValue(undefined);

      // Act
      const result = await service.getActives();

      // Assert
      expect(result).toEqual(freshData.slice(0, 10));
      expect(mockRepository.getActives).toHaveBeenCalledTimes(1);
      expect(setMarketDataToKV).toHaveBeenCalledWith(
        mockKv,
        'market:actives:top50',
        freshData,
        300
      );
    });
  });

  describe('getSectorsPerformance', () => {
    it('should return cached data when KV cache hit', async () => {
      // Arrange
      const cachedData: SectorPerformanceItem[] = [
        {
          sector: 'Technology',
          changesPercentage: 2.5,
        },
        {
          sector: 'Energy',
          changesPercentage: -1.8,
        },
      ];

      vi.mocked(getSectorsDataFromKV).mockResolvedValue({
        data: cachedData,
        cachedAt: Date.now(),
      });

      // Act
      const result = await service.getSectorsPerformance();

      // Assert
      expect(result).toEqual(cachedData);
      expect(getSectorsDataFromKV).toHaveBeenCalledWith(mockKv, 'market:sectors-performance');
      expect(mockRepository.getSectorsPerformance).not.toHaveBeenCalled();
      expect(setSectorsDataToKV).not.toHaveBeenCalled();
    });

    it('should fetch from FMP and cache when KV cache miss', async () => {
      // Arrange
      const freshData: SectorPerformanceItem[] = [
        {
          sector: 'Technology',
          changesPercentage: 2.5,
        },
      ];

      vi.mocked(getSectorsDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getSectorsPerformance).mockResolvedValue(freshData);
      vi.mocked(setSectorsDataToKV).mockResolvedValue(undefined);

      // Act
      const result = await service.getSectorsPerformance();

      // Assert
      expect(result).toEqual(freshData);
      expect(mockRepository.getSectorsPerformance).toHaveBeenCalledTimes(1);
      expect(setSectorsDataToKV).toHaveBeenCalledWith(
        mockKv,
        'market:sectors-performance',
        freshData,
        2700 // 45 minutes
      );
    });

    it('should return stale cache when FMP API fails', async () => {
      // Arrange
      const staleData: SectorPerformanceItem[] = [
        {
          sector: 'Technology',
          changesPercentage: 2.5,
        },
      ];

      vi.mocked(getSectorsDataFromKV).mockResolvedValue(null);
      vi.mocked(mockRepository.getSectorsPerformance).mockRejectedValue(new Error('FMP API failed'));
      vi.mocked(getStaleSectorsDataFromKV).mockResolvedValue({
        data: staleData,
        cachedAt: Date.now() - 3600000, // 1 hour ago
      });

      // Act
      const result = await service.getSectorsPerformance();

      // Assert
      expect(result).toEqual(staleData);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('FMP API failed, returning stale cache for sectors performance')
      );
    });
  });
});

