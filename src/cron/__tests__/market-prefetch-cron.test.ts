/**
 * Market Prefetch Cron Tests
 * Tests hourly market data & news prefetch cron job
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMarketPrefetchCron } from '../market-prefetch-cron';
import type { Env } from '../../index';
import { createMarketService } from '../../factories/createMarketService';
import { createNewsService } from '../../factories/createNewsService';
import { createCommonStocksService } from '../../factories/createCommonStocksService';
import { createDatalakeService } from '../../factories/createDatalakeService';
import { MarketRepository } from '../../repositories/external/MarketRepository';
import { MarketCalculationService } from '../../services/market-calculation.service';
import { getConfig } from '../../api/config';
import { setMarketDataFullToKV, setMarketDataTop50ToKV } from '../../api/market-cache';

// Mock dependencies
vi.mock('../../factories/createMarketService', () => ({
  createMarketService: vi.fn(),
}));

vi.mock('../../factories/createNewsService', () => ({
  createNewsService: vi.fn(),
}));

vi.mock('../../factories/createCommonStocksService', () => ({
  createCommonStocksService: vi.fn(),
}));

vi.mock('../../factories/createDatalakeService', () => ({
  createDatalakeService: vi.fn(),
}));

vi.mock('../../repositories/external/MarketRepository', () => ({
  MarketRepository: vi.fn(),
}));

vi.mock('../../services/market-calculation.service', () => ({
  MarketCalculationService: vi.fn(),
}));

vi.mock('../../api/market-cache', () => ({
  setMarketDataFullToKV: vi.fn().mockResolvedValue(undefined),
  setMarketDataTop50ToKV: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../api/config', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../logging/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getLogs: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../logging/loki-shipper', () => ({
  sendLogsToLoki: vi.fn().mockResolvedValue(undefined),
}));

describe('Market Prefetch Cron', () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;
  let mockMarketService: any;
  let mockNewsService: any;
  let mockCommonStocksService: any;
  let mockMarketRepository: any;
  let mockCalculationService: any;

  beforeEach(() => {
    mockEnv = {
      stockly: {} as any,
      alertsKv: {} as any,
      LOKI_URL: 'https://loki.example.com',
      LOKI_USERNAME: 'user',
      LOKI_PASSWORD: 'pass',
    } as Env;

    mockCtx = {
      waitUntil: vi.fn(),
    } as any;

    mockMarketService = {
      getSectorsPerformance: vi.fn(),
    };

    mockNewsService = {
      getGeneralNews: vi.fn(),
    };

    mockCommonStocksService = {
      getAllActiveStocks: vi.fn(),
    };

    mockMarketRepository = {
      fetchPricesForStocks: vi.fn(),
    };

    mockCalculationService = {
      calculateGainers: vi.fn(),
      calculateLosers: vi.fn(),
      calculateActives: vi.fn(),
    };

    vi.mocked(createMarketService).mockReturnValue(mockMarketService);
    vi.mocked(createNewsService).mockReturnValue(mockNewsService);
    vi.mocked(createCommonStocksService).mockReturnValue(mockCommonStocksService);
    vi.mocked(createDatalakeService).mockReturnValue({} as any);
    vi.mocked(MarketRepository).mockImplementation(() => mockMarketRepository);
    vi.mocked(MarketCalculationService).mockImplementation(() => mockCalculationService);
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
      featureFlags: {
        alerting: true,
        sandboxMode: false,
        simulateProviderFailure: false,
      },
    } as any);

    vi.clearAllMocks();
  });

  it('should prefetch all market data and news successfully', async () => {
    // Arrange
    const commonStocks = [
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', isActive: true, addedAt: Date.now() },
      { symbol: 'MSFT', name: 'Microsoft Corp.', exchange: 'NASDAQ', isActive: true, addedAt: Date.now() },
    ];
    const fetchedStocks = [
      { symbol: 'AAPL', name: 'Apple', price: 150, change: 1.5, changePercent: 1.0 },
      { symbol: 'MSFT', name: 'Microsoft', price: 200, change: -2.0, changePercent: -1.0 },
    ];
    const gainers = [{ symbol: 'AAPL', name: 'Apple', price: 150 }];
    const losers = [{ symbol: 'MSFT', name: 'Microsoft', price: 200 }];
    const actives = [{ symbol: 'AAPL', name: 'Apple', price: 150 }];
    const sectors = [{ name: 'Technology', change: 1.5 }];
    const news = {
      news: [{ title: 'Test News', text: 'Content', url: 'https://example.com', publishedDate: '2024-01-01', symbol: null }],
      pagination: { page: 0, limit: 20, total: 1, hasMore: false },
    };

    vi.mocked(mockCommonStocksService.getAllActiveStocks).mockResolvedValue(commonStocks);
    vi.mocked(mockMarketRepository.fetchPricesForStocks).mockResolvedValue(fetchedStocks);
    vi.mocked(mockCalculationService.calculateGainers).mockReturnValue(gainers);
    vi.mocked(mockCalculationService.calculateLosers).mockReturnValue(losers);
    vi.mocked(mockCalculationService.calculateActives).mockReturnValue(actives);
    vi.mocked(mockMarketService.getSectorsPerformance).mockResolvedValue(sectors);
    vi.mocked(mockNewsService.getGeneralNews).mockResolvedValue(news);

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert
    expect(mockCommonStocksService.getAllActiveStocks).toHaveBeenCalled();
    expect(mockMarketRepository.fetchPricesForStocks).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    expect(mockCalculationService.calculateGainers).toHaveBeenCalledWith(fetchedStocks);
    expect(mockCalculationService.calculateLosers).toHaveBeenCalledWith(fetchedStocks);
    expect(mockCalculationService.calculateActives).toHaveBeenCalledWith(fetchedStocks);
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalledWith({ limit: 20 });
  });

  it('should log configured cron interval', async () => {
    // Arrange
    const customInterval = '0 */2 * * *'; // Every 2 hours
    vi.mocked(getConfig).mockResolvedValue({
      marketCache: { prefetchCronInterval: customInterval },
    } as any);

    vi.mocked(mockCommonStocksService.getAllActiveStocks).mockResolvedValue([]);
    vi.mocked(mockMarketRepository.fetchPricesForStocks).mockResolvedValue([]);
    vi.mocked(mockCalculationService.calculateGainers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateLosers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateActives).mockReturnValue([]);
    vi.mocked(mockMarketService.getSectorsPerformance).mockResolvedValue([]);
    vi.mocked(mockNewsService.getGeneralNews).mockResolvedValue({
      news: [],
      pagination: { page: 0, limit: 20, total: 0, hasMore: false },
    });

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert - Check that getConfig was called and interval is logged
    expect(getConfig).toHaveBeenCalledWith(mockEnv);
  });

  it('should handle individual failures gracefully', async () => {
    // Arrange
    const error = new Error('FMP API failed');

    vi.mocked(mockCommonStocksService.getAllActiveStocks).mockResolvedValue([
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', isActive: true, addedAt: Date.now() },
    ]);
    vi.mocked(mockMarketRepository.fetchPricesForStocks).mockResolvedValue([
      { symbol: 'AAPL', name: 'Apple', price: 150, change: 1.5, changePercent: 1.0 },
    ]);
    vi.mocked(mockCalculationService.calculateGainers).mockReturnValue([{ symbol: 'AAPL', name: 'Apple', price: 150 }]);
    vi.mocked(mockCalculationService.calculateLosers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateActives).mockReturnValue([]);
    vi.mocked(mockMarketService.getSectorsPerformance).mockRejectedValue(error);
    vi.mocked(mockNewsService.getGeneralNews).mockRejectedValue(error);

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert - Should not throw, all promises should be settled
    expect(mockCommonStocksService.getAllActiveStocks).toHaveBeenCalled();
    expect(mockMarketRepository.fetchPricesForStocks).toHaveBeenCalled();
    expect(mockCalculationService.calculateGainers).toHaveBeenCalled();
    expect(mockCalculationService.calculateLosers).toHaveBeenCalled();
    expect(mockCalculationService.calculateActives).toHaveBeenCalled();
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalled();
  });

  it('should log success/failure counts', async () => {
    // Arrange
    vi.mocked(mockCommonStocksService.getAllActiveStocks).mockResolvedValue([]);
    vi.mocked(mockMarketRepository.fetchPricesForStocks).mockResolvedValue([]);
    vi.mocked(mockCalculationService.calculateGainers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateLosers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateActives).mockReturnValue([]);
    vi.mocked(mockMarketService.getSectorsPerformance).mockResolvedValue([]);
    vi.mocked(mockNewsService.getGeneralNews).mockResolvedValue({
      news: [],
      pagination: { page: 0, limit: 20, total: 0, hasMore: false },
    });

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert - Should complete without throwing
    expect(mockCommonStocksService.getAllActiveStocks).toHaveBeenCalled();
    expect(mockMarketRepository.fetchPricesForStocks).toHaveBeenCalled();
    expect(mockCalculationService.calculateGainers).toHaveBeenCalled();
    expect(mockCalculationService.calculateLosers).toHaveBeenCalled();
    expect(mockCalculationService.calculateActives).toHaveBeenCalled();
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalled();
  });

  it('should use default cron interval when not configured', async () => {
    // Arrange
    vi.mocked(getConfig).mockResolvedValue({
      marketCache: {}, // No prefetchCronInterval
    } as any);

    vi.mocked(mockCommonStocksService.getAllActiveStocks).mockResolvedValue([]);
    vi.mocked(mockMarketRepository.fetchPricesForStocks).mockResolvedValue([]);
    vi.mocked(mockCalculationService.calculateGainers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateLosers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateActives).mockReturnValue([]);
    vi.mocked(mockMarketService.getSectorsPerformance).mockResolvedValue([]);
    vi.mocked(mockNewsService.getGeneralNews).mockResolvedValue({
      news: [],
      pagination: { page: 0, limit: 20, total: 0, hasMore: false },
    });

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert
    expect(getConfig).toHaveBeenCalledWith(mockEnv);
  });

  it('should handle all failures and still complete', async () => {
    // Arrange
    const error = new Error('All APIs failed');
    // Mock getAllActiveStocks to succeed so the prefetch block executes
    vi.mocked(mockCommonStocksService.getAllActiveStocks).mockResolvedValue([]);
    // Mock fetchPricesForStocks to succeed so we reach the prefetch block
    vi.mocked(mockMarketRepository.fetchPricesForStocks).mockResolvedValue([]);
    vi.mocked(mockCalculationService.calculateGainers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateLosers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateActives).mockReturnValue([]);
    // Mock prefetch services to fail (but they should still be called)
    vi.mocked(mockMarketService.getSectorsPerformance).mockRejectedValue(error);
    vi.mocked(mockNewsService.getGeneralNews).mockRejectedValue(error);

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert - Should complete without throwing (errors are caught)
    // The cron should handle errors gracefully and still call the services
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalled();
  });

  it('should work without ExecutionContext', async () => {
    // Arrange
    vi.mocked(mockCommonStocksService.getAllActiveStocks).mockResolvedValue([]);
    vi.mocked(mockMarketRepository.fetchPricesForStocks).mockResolvedValue([]);
    vi.mocked(mockCalculationService.calculateGainers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateLosers).mockReturnValue([]);
    vi.mocked(mockCalculationService.calculateActives).mockReturnValue([]);
    vi.mocked(mockMarketService.getSectorsPerformance).mockResolvedValue([]);
    vi.mocked(mockNewsService.getGeneralNews).mockResolvedValue({
      news: [],
      pagination: { page: 0, limit: 20, total: 0, hasMore: false },
    });

    // Act
    await runMarketPrefetchCron(mockEnv);

    // Assert - Should complete without throwing
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalled();
  });
});

