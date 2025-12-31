/**
 * Quotes Service Tests
 * Tests business logic for quotes with working hours support
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuotesService } from '../quotes.service';
import type { IQuotesRepository } from '../../repositories/interfaces/IQuotesRepository';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import type { Quote } from '@stockly/shared/types';
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

describe('QuotesService', () => {
  let service: QuotesService;
  let mockRepo: IQuotesRepository;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockRepo = {
      getQuote: vi.fn(),
      getQuotes: vi.fn(),
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

    service = new QuotesService(mockRepo, mockEnv, mockLogger);
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

  describe('getQuote', () => {
    it('should return quote from repository during working hours', async () => {
      // Arrange
      const symbol = 'AAPL';
      const mockQuote: Quote = {
        symbol: 'AAPL',
        price: 150.0,
        dayLow: 149.0,
        dayHigh: 152.0,
        volume: 1000000,
        timestamp: Date.now() / 1000,
      };

      vi.mocked(mockRepo.getQuote).mockResolvedValue(mockQuote);

      // Act
      const result = await service.getQuote(symbol);

      // Assert
      expect(result).toEqual(mockQuote);
      expect(mockRepo.getQuote).toHaveBeenCalledWith('AAPL');
    });

    it('should return stale cache when outside working hours', async () => {
      // Arrange
      const symbol = 'AAPL';
      const staleQuote: Quote = {
        symbol: 'AAPL',
        price: 150.0,
        dayLow: 149.0,
        dayHigh: 152.0,
        volume: 1000000,
        timestamp: Date.now() / 1000,
      };

      vi.mocked(isWithinWorkingHours).mockReturnValue(false);
      vi.mocked(getStaleCacheEntry).mockReturnValue({
        data: staleQuote,
        cachedAt: Date.now() - 3600000,
      });

      // Act
      const result = await service.getQuote(symbol);

      // Assert
      expect(result).toEqual(staleQuote);
      expect(mockLogger?.info).toHaveBeenCalledWith(
        expect.stringContaining('Outside working hours, returning stale cache'),
        expect.any(Object)
      );
      expect(mockRepo.getQuote).not.toHaveBeenCalled();
    });

    it('should throw error when outside working hours and no cache', async () => {
      // Arrange
      const symbol = 'AAPL';

      vi.mocked(isWithinWorkingHours).mockReturnValue(false);
      vi.mocked(getStaleCacheEntry).mockReturnValue(null);

      // Act & Assert
      await expect(service.getQuote(symbol)).rejects.toThrow(
        'Quote unavailable outside working hours'
      );
      expect(mockRepo.getQuote).not.toHaveBeenCalled();
    });

    it('should throw error for empty symbol', async () => {
      // Arrange
      const symbol = '';

      // Act & Assert
      await expect(service.getQuote(symbol)).rejects.toThrow('Invalid symbol format');
      expect(mockRepo.getQuote).not.toHaveBeenCalled();
    });
  });

  describe('getQuotes', () => {
    it('should return quotes from repository during working hours', async () => {
      // Arrange
      const symbols = ['AAPL', 'MSFT'];
      const mockQuotes: Quote[] = [
        {
          symbol: 'AAPL',
          price: 150.0,
          dayLow: 149.0,
          dayHigh: 152.0,
          volume: 1000000,
          timestamp: Date.now() / 1000,
        },
        {
          symbol: 'MSFT',
          price: 200.0,
          dayLow: 199.0,
          dayHigh: 201.0,
          volume: 2000000,
          timestamp: Date.now() / 1000,
        },
      ];

      vi.mocked(mockRepo.getQuotes).mockResolvedValue(mockQuotes);

      // Act
      const result = await service.getQuotes(symbols);

      // Assert
      expect(result).toEqual(mockQuotes);
      expect(mockRepo.getQuotes).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });

    it('should return stale cache when outside working hours', async () => {
      // Arrange
      const symbols = ['AAPL', 'MSFT'];
      const staleQuotes: Quote[] = [
        {
          symbol: 'AAPL',
          price: 150.0,
          dayLow: 149.0,
          dayHigh: 152.0,
          volume: 1000000,
          timestamp: Date.now() / 1000,
        },
      ];

      vi.mocked(isWithinWorkingHours).mockReturnValue(false);
      vi.mocked(getStaleCacheEntry).mockReturnValueOnce({
        data: staleQuotes[0],
        cachedAt: Date.now() - 3600000,
      });
      vi.mocked(getStaleCacheEntry).mockReturnValueOnce(null); // No cache for MSFT

      // Act
      const result = await service.getQuotes(symbols);

      // Assert
      expect(result).toEqual(staleQuotes);
      expect(mockLogger?.info).toHaveBeenCalledWith(
        expect.stringContaining('Outside working hours, returning stale cache'),
        expect.any(Object)
      );
      expect(mockRepo.getQuotes).not.toHaveBeenCalled();
    });

    it('should return empty array when outside working hours and no cache', async () => {
      // Arrange
      const symbols = ['AAPL', 'MSFT'];

      vi.mocked(isWithinWorkingHours).mockReturnValue(false);
      vi.mocked(getStaleCacheEntry).mockReturnValue(null);

      // Act
      const result = await service.getQuotes(symbols);

      // Assert
      expect(result).toEqual([]);
      expect(mockLogger?.warn).toHaveBeenCalledWith(
        'Outside working hours and no cache available for quotes'
      );
      expect(mockRepo.getQuotes).not.toHaveBeenCalled();
    });

    it('should remove duplicates from symbols', async () => {
      // Arrange
      const symbols = ['AAPL', 'MSFT', 'AAPL'];
      const mockQuotes: Quote[] = [
        {
          symbol: 'AAPL',
          price: 150.0,
          dayLow: 149.0,
          dayHigh: 152.0,
          volume: 1000000,
          timestamp: Date.now() / 1000,
        },
        {
          symbol: 'MSFT',
          price: 200.0,
          dayLow: 199.0,
          dayHigh: 201.0,
          volume: 2000000,
          timestamp: Date.now() / 1000,
        },
      ];

      vi.mocked(mockRepo.getQuotes).mockResolvedValue(mockQuotes);

      // Act
      await service.getQuotes(symbols);

      // Assert
      expect(mockRepo.getQuotes).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });

    it('should throw error for empty symbols array', async () => {
      // Arrange
      const symbols: string[] = [];

      // Act & Assert
      await expect(service.getQuotes(symbols)).rejects.toThrow('Invalid symbols format');
      expect(mockRepo.getQuotes).not.toHaveBeenCalled();
    });

    it('should work without Env (no working hours check)', async () => {
      // Arrange
      const serviceWithoutEnv = new QuotesService(mockRepo);
      const symbols = ['AAPL'];
      const mockQuotes: Quote[] = [
        {
          symbol: 'AAPL',
          price: 150.0,
          dayLow: 149.0,
          dayHigh: 152.0,
          volume: 1000000,
          timestamp: Date.now() / 1000,
        },
      ];

      vi.mocked(mockRepo.getQuotes).mockResolvedValue(mockQuotes);

      // Act
      const result = await serviceWithoutEnv.getQuotes(symbols);

      // Assert
      expect(result).toEqual(mockQuotes);
      expect(getConfig).not.toHaveBeenCalled();
    });
  });
});

