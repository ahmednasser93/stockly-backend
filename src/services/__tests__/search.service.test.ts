/**
 * Search Service Tests
 * Tests business logic for search with working hours support
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../search.service';
import type { ISearchRepository } from '../../repositories/interfaces/ISearchRepository';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import type { StockSearchResult } from '@stockly/shared/types';
import { getConfig } from '../../api/config';
import { isWithinWorkingHours } from '../../utils/working-hours';

// Mock dependencies
vi.mock('../../api/config', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../utils/working-hours', () => ({
  isWithinWorkingHours: vi.fn(),
}));

describe('SearchService', () => {
  let service: SearchService;
  let mockRepo: ISearchRepository;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockRepo = {
      searchStocks: vi.fn(),
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

    service = new SearchService(mockRepo, mockEnv, mockLogger);
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

  describe('searchStocks', () => {
    it('should return search results from repository during working hours', async () => {
      // Arrange
      const query = 'Apple';
      const mockResults: StockSearchResult[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          exchange: 'NASDAQ',
          type: 'stock',
        },
      ];

      vi.mocked(mockRepo.searchStocks).mockResolvedValue(mockResults);

      // Act
      const result = await service.searchStocks(query);

      // Assert
      expect(result).toEqual(mockResults);
      expect(mockRepo.searchStocks).toHaveBeenCalledWith('Apple');
    });

    it('should return empty array when outside working hours', async () => {
      // Arrange
      const query = 'Apple';

      vi.mocked(isWithinWorkingHours).mockReturnValue(false);

      // Act
      const result = await service.searchStocks(query);

      // Assert
      expect(result).toEqual([]);
      expect(mockLogger?.info).toHaveBeenCalledWith(
        'Outside working hours, search unavailable',
        expect.any(Object)
      );
      expect(mockRepo.searchStocks).not.toHaveBeenCalled();
    });

    it('should return empty array for query shorter than 2 characters', async () => {
      // Arrange
      const query = 'A';

      // Act
      const result = await service.searchStocks(query);

      // Assert
      expect(result).toEqual([]);
      expect(mockRepo.searchStocks).not.toHaveBeenCalled();
    });

    it('should return empty array for empty query', async () => {
      // Arrange
      const query = '';

      // Act
      const result = await service.searchStocks(query);

      // Assert
      expect(result).toEqual([]);
      expect(mockRepo.searchStocks).not.toHaveBeenCalled();
    });

    it('should trim query before searching', async () => {
      // Arrange
      const query = '  Apple  ';
      const mockResults: StockSearchResult[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          exchange: 'NASDAQ',
          type: 'stock',
        },
      ];

      vi.mocked(mockRepo.searchStocks).mockResolvedValue(mockResults);

      // Act
      await service.searchStocks(query);

      // Assert
      expect(mockRepo.searchStocks).toHaveBeenCalledWith('Apple');
    });

    it('should work without Env (no working hours check)', async () => {
      // Arrange
      const serviceWithoutEnv = new SearchService(mockRepo);
      const query = 'Apple';
      const mockResults: StockSearchResult[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          exchange: 'NASDAQ',
          type: 'stock',
        },
      ];

      vi.mocked(mockRepo.searchStocks).mockResolvedValue(mockResults);

      // Act
      const result = await serviceWithoutEnv.searchStocks(query);

      // Assert
      expect(result).toEqual(mockResults);
      expect(getConfig).not.toHaveBeenCalled();
    });
  });
});

