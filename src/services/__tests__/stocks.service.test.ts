/**
 * Stock Service Tests
 * Tests business logic in isolation with mocked repository
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StockService } from '../stocks.service';
import type { IStockRepository } from '../../repositories/interfaces/IStockRepository';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import type { StockDetails } from '@stockly/shared/types';
import { getConfig } from '../../api/config';
import { isWithinWorkingHours } from '../../utils/working-hours';
import { getStaleCacheEntry } from '../../api/cache';

// Mock dependencies
vi.mock('../../api/config', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../utils/working-hours', () => ({
  isWithinWorkingHours: vi.fn(),
}));

vi.mock('../../api/cache', () => ({
  getStaleCacheEntry: vi.fn(),
}));

describe('StockService', () => {
  let service: StockService;
  let mockRepo: IStockRepository;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockRepo = {
      getStockDetails: vi.fn(),
      watchStockDetails: vi.fn(),
    } as any;

    mockEnv = {
      stockly: {} as any,
      alertsKv: {} as any,
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    service = new StockService(mockRepo, mockEnv, mockLogger);
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(getConfig).mockResolvedValue({
      pollingIntervalSec: 30,
      kvWriteIntervalSec: 3600,
      primaryProvider: 'alpha-feed',
      backupProvider: 'beta-feed',
      alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
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

  describe('getStockDetails', () => {
    it('should return stock details for valid symbol', async () => {
      // Arrange
      const symbol = 'AAPL';
      const mockDetails: StockDetails = {
        symbol: 'AAPL',
        profile: {
          companyName: 'Apple Inc.',
          industry: 'Technology',
          sector: 'Consumer Electronics',
          description: 'Test description',
          website: 'https://apple.com',
          image: 'https://example.com/image.png',
        },
        quote: {
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
          dayHigh: 152.0,
          dayLow: 149.0,
          open: 150.5,
          previousClose: 148.5,
          volume: 1000000,
          marketCap: 2500000000000,
        },
        chart: {
          '1D': [],
          '1W': [],
          '1M': [],
          '3M': [],
          '1Y': [],
          'ALL': [],
        },
        financials: {
          income: [],
          keyMetrics: [],
          ratios: [],
        },
        news: [],
        peers: [],
      };

      vi.mocked(mockRepo.getStockDetails).mockResolvedValue(mockDetails);

      // Act
      const result = await service.getStockDetails(symbol);

      // Assert
      expect(result).toEqual(mockDetails);
      expect(mockRepo.getStockDetails).toHaveBeenCalledWith('AAPL');
    });

    it('should normalize symbol to uppercase', async () => {
      // Arrange
      const symbol = 'aapl';
      const mockDetails: StockDetails = {
        symbol: 'AAPL',
        profile: {
          companyName: 'Apple Inc.',
          industry: 'Technology',
          sector: 'Consumer Electronics',
          description: 'Test',
          website: 'https://apple.com',
          image: 'https://example.com/image.png',
        },
        quote: {
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
          dayHigh: 152.0,
          dayLow: 149.0,
          open: 150.5,
          previousClose: 148.5,
          volume: 1000000,
          marketCap: 2500000000000,
        },
        chart: {
          '1D': [],
          '1W': [],
          '1M': [],
          '3M': [],
          '1Y': [],
          'ALL': [],
        },
        financials: {
          income: [],
          keyMetrics: [],
          ratios: [],
        },
        news: [],
        peers: [],
      };

      vi.mocked(mockRepo.getStockDetails).mockResolvedValue(mockDetails);

      // Act
      await service.getStockDetails(symbol);

      // Assert
      expect(mockRepo.getStockDetails).toHaveBeenCalledWith('AAPL');
    });

    it('should throw error for empty symbol', async () => {
      // Arrange
      const symbol = '';

      // Act & Assert
      await expect(service.getStockDetails(symbol)).rejects.toThrow('Invalid symbol format');
      expect(mockRepo.getStockDetails).not.toHaveBeenCalled();
    });

    it('should throw error for symbol longer than 10 characters', async () => {
      // Arrange
      const symbol = 'A'.repeat(11);

      // Act & Assert
      await expect(service.getStockDetails(symbol)).rejects.toThrow('Invalid symbol format');
      expect(mockRepo.getStockDetails).not.toHaveBeenCalled();
    });

    it('should throw error when repository throws', async () => {
      // Arrange
      const symbol = 'AAPL';
      const error = new Error('Repository error');
      vi.mocked(mockRepo.getStockDetails).mockRejectedValue(error);

      // Act & Assert
      await expect(service.getStockDetails(symbol)).rejects.toThrow('Repository error');
    });

    it('should return stale cache when outside working hours', async () => {
      // Arrange
      const symbol = 'AAPL';
      const staleDetails: StockDetails = {
        symbol: 'AAPL',
        profile: {
          companyName: 'Apple Inc.',
          industry: 'Technology',
          sector: 'Consumer Electronics',
          description: 'Test',
          website: 'https://apple.com',
          image: 'https://example.com/image.png',
        },
        quote: {
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
          dayHigh: 152.0,
          dayLow: 149.0,
          open: 150.5,
          previousClose: 148.5,
          volume: 1000000,
          marketCap: 2500000000000,
        },
        chart: {
          '1D': [],
          '1W': [],
          '1M': [],
          '3M': [],
          '1Y': [],
          'ALL': [],
        },
        financials: {
          income: [],
          keyMetrics: [],
          ratios: [],
        },
        news: [],
        peers: [],
        cached: true,
      };

      vi.mocked(isWithinWorkingHours).mockReturnValue(false);
      vi.mocked(getStaleCacheEntry).mockReturnValue({
        data: staleDetails,
        cachedAt: Date.now() - 3600000,
      });

      // Act
      const result = await service.getStockDetails(symbol);

      // Assert
      expect(result).toEqual(staleDetails);
      expect(mockLogger?.info).toHaveBeenCalledWith(
        expect.stringContaining('Outside working hours, returning stale cache'),
        expect.any(Object)
      );
      expect(mockRepo.getStockDetails).not.toHaveBeenCalled();
    });

    it('should throw error when outside working hours and no cache', async () => {
      // Arrange
      const symbol = 'AAPL';

      vi.mocked(isWithinWorkingHours).mockReturnValue(false);
      vi.mocked(getStaleCacheEntry).mockReturnValue(null);

      // Act & Assert
      await expect(service.getStockDetails(symbol)).rejects.toThrow(
        'Stock details unavailable outside working hours'
      );
      expect(mockRepo.getStockDetails).not.toHaveBeenCalled();
    });
  });

  describe('watchStockDetails', () => {
    it('should return async iterable for valid symbol', async () => {
      // Arrange
      const symbol = 'AAPL';
      const mockDetails: StockDetails = {
        symbol: 'AAPL',
        profile: {
          companyName: 'Apple Inc.',
          industry: 'Technology',
          sector: 'Consumer Electronics',
          description: 'Test',
          website: 'https://apple.com',
          image: 'https://example.com/image.png',
        },
        quote: {
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
          dayHigh: 152.0,
          dayLow: 149.0,
          open: 150.5,
          previousClose: 148.5,
          volume: 1000000,
          marketCap: 2500000000000,
        },
        chart: {
          '1D': [],
          '1W': [],
          '1M': [],
          '3M': [],
          '1Y': [],
          'ALL': [],
        },
        financials: {
          income: [],
          keyMetrics: [],
          ratios: [],
        },
        news: [],
        peers: [],
      };

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield mockDetails;
        },
      };

      vi.mocked(mockRepo.watchStockDetails).mockResolvedValue(mockStream);

      // Act
      const result = await service.watchStockDetails(symbol);

      // Assert
      expect(result).toBe(mockStream);
      expect(mockRepo.watchStockDetails).toHaveBeenCalledWith('AAPL');
    });

    it('should normalize symbol to uppercase', async () => {
      // Arrange
      const symbol = 'aapl';
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {} as StockDetails;
        },
      };

      vi.mocked(mockRepo.watchStockDetails).mockResolvedValue(mockStream);

      // Act
      await service.watchStockDetails(symbol);

      // Assert
      expect(mockRepo.watchStockDetails).toHaveBeenCalledWith('AAPL');
    });

    it('should throw error for invalid symbol', async () => {
      // Arrange
      const symbol = '';

      // Act & Assert
      await expect(service.watchStockDetails(symbol)).rejects.toThrow('Invalid symbol format');
      expect(mockRepo.watchStockDetails).not.toHaveBeenCalled();
    });
  });
});

