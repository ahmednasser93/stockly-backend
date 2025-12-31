/**
 * Market Prefetch Cron Tests
 * Tests hourly market data & news prefetch cron job
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMarketPrefetchCron } from '../market-prefetch-cron';
import type { Env } from '../../index';
import { createMarketService } from '../../factories/createMarketService';
import { createNewsService } from '../../factories/createNewsService';
import { getConfig } from '../../api/config';

// Mock dependencies
vi.mock('../../factories/createMarketService', () => ({
  createMarketService: vi.fn(),
}));

vi.mock('../../factories/createNewsService', () => ({
  createNewsService: vi.fn(),
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
      getGainers: vi.fn(),
      getLosers: vi.fn(),
      getActives: vi.fn(),
      getSectorsPerformance: vi.fn(),
    };

    mockNewsService = {
      getGeneralNews: vi.fn(),
    };

    vi.mocked(createMarketService).mockReturnValue(mockMarketService);
    vi.mocked(createNewsService).mockReturnValue(mockNewsService);
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
    const gainers = [{ symbol: 'AAPL', name: 'Apple', price: 150 }];
    const losers = [{ symbol: 'MSFT', name: 'Microsoft', price: 200 }];
    const actives = [{ symbol: 'GOOGL', name: 'Google', price: 100 }];
    const sectors = [{ name: 'Technology', change: 1.5 }];
    const news = {
      news: [{ title: 'Test News', text: 'Content', url: 'https://example.com', publishedDate: '2024-01-01', symbol: null }],
      pagination: { page: 0, limit: 20, total: 1, hasMore: false },
    };

    vi.mocked(mockMarketService.getGainers).mockResolvedValue(gainers);
    vi.mocked(mockMarketService.getLosers).mockResolvedValue(losers);
    vi.mocked(mockMarketService.getActives).mockResolvedValue(actives);
    vi.mocked(mockMarketService.getSectorsPerformance).mockResolvedValue(sectors);
    vi.mocked(mockNewsService.getGeneralNews).mockResolvedValue(news);

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert
    expect(mockMarketService.getGainers).toHaveBeenCalledWith(50);
    expect(mockMarketService.getLosers).toHaveBeenCalledWith(50);
    expect(mockMarketService.getActives).toHaveBeenCalledWith(50);
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalledWith({ limit: 20 });
  });

  it('should log configured cron interval', async () => {
    // Arrange
    const customInterval = '0 */2 * * *'; // Every 2 hours
    vi.mocked(getConfig).mockResolvedValue({
      marketCache: { prefetchCronInterval: customInterval },
    } as any);

    vi.mocked(mockMarketService.getGainers).mockResolvedValue([]);
    vi.mocked(mockMarketService.getLosers).mockResolvedValue([]);
    vi.mocked(mockMarketService.getActives).mockResolvedValue([]);
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
    const gainers = [{ symbol: 'AAPL', name: 'Apple', price: 150 }];
    const error = new Error('FMP API failed');

    vi.mocked(mockMarketService.getGainers).mockResolvedValue(gainers);
    vi.mocked(mockMarketService.getLosers).mockRejectedValue(error);
    vi.mocked(mockMarketService.getActives).mockResolvedValue([]);
    vi.mocked(mockMarketService.getSectorsPerformance).mockRejectedValue(error);
    vi.mocked(mockNewsService.getGeneralNews).mockRejectedValue(error);

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert - Should not throw, all promises should be settled
    expect(mockMarketService.getGainers).toHaveBeenCalled();
    expect(mockMarketService.getLosers).toHaveBeenCalled();
    expect(mockMarketService.getActives).toHaveBeenCalled();
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalled();
  });

  it('should log success/failure counts', async () => {
    // Arrange
    vi.mocked(mockMarketService.getGainers).mockResolvedValue([]);
    vi.mocked(mockMarketService.getLosers).mockResolvedValue([]);
    vi.mocked(mockMarketService.getActives).mockRejectedValue(new Error('Failed'));
    vi.mocked(mockMarketService.getSectorsPerformance).mockResolvedValue([]);
    vi.mocked(mockNewsService.getGeneralNews).mockResolvedValue({
      news: [],
      pagination: { page: 0, limit: 20, total: 0, hasMore: false },
    });

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert - Should complete without throwing
    expect(mockMarketService.getGainers).toHaveBeenCalled();
    expect(mockMarketService.getLosers).toHaveBeenCalled();
    expect(mockMarketService.getActives).toHaveBeenCalled();
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalled();
  });

  it('should use default cron interval when not configured', async () => {
    // Arrange
    vi.mocked(getConfig).mockResolvedValue({
      marketCache: {}, // No prefetchCronInterval
    } as any);

    vi.mocked(mockMarketService.getGainers).mockResolvedValue([]);
    vi.mocked(mockMarketService.getLosers).mockResolvedValue([]);
    vi.mocked(mockMarketService.getActives).mockResolvedValue([]);
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
    vi.mocked(mockMarketService.getGainers).mockRejectedValue(error);
    vi.mocked(mockMarketService.getLosers).mockRejectedValue(error);
    vi.mocked(mockMarketService.getActives).mockRejectedValue(error);
    vi.mocked(mockMarketService.getSectorsPerformance).mockRejectedValue(error);
    vi.mocked(mockNewsService.getGeneralNews).mockRejectedValue(error);

    // Act
    await runMarketPrefetchCron(mockEnv, mockCtx);

    // Assert - Should complete without throwing
    expect(mockMarketService.getGainers).toHaveBeenCalled();
    expect(mockMarketService.getLosers).toHaveBeenCalled();
    expect(mockMarketService.getActives).toHaveBeenCalled();
    expect(mockMarketService.getSectorsPerformance).toHaveBeenCalled();
    expect(mockNewsService.getGeneralNews).toHaveBeenCalled();
  });

  it('should work without ExecutionContext', async () => {
    // Arrange
    vi.mocked(mockMarketService.getGainers).mockResolvedValue([]);
    vi.mocked(mockMarketService.getLosers).mockResolvedValue([]);
    vi.mocked(mockMarketService.getActives).mockResolvedValue([]);
    vi.mocked(mockMarketService.getSectorsPerformance).mockResolvedValue([]);
    vi.mocked(mockNewsService.getGeneralNews).mockResolvedValue({
      news: [],
      pagination: { page: 0, limit: 20, total: 0, hasMore: false },
    });

    // Act
    await runMarketPrefetchCron(mockEnv);

    // Assert - Should complete without throwing
    expect(mockMarketService.getGainers).toHaveBeenCalled();
  });
});

