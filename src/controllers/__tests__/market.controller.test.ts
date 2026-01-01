/**
 * Market Controller Tests
 * Tests controller endpoint logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketController } from '../market.controller';
import type { MarketService } from '../../services/market.service';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import { createErrorResponse } from '../../auth/error-handler';
import type { MarketStockItem, SectorPerformanceItem } from '@stockly/shared/types';
import { MarketResponseSchema, GetMarketRequestSchema, SectorsResponseSchema, PaginatedMarketResponseSchema, MarketStatusResponseSchema } from '@stockly/shared/schemas';

describe('MarketController', () => {
  let controller: MarketController;
  let mockService: MarketService;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockEnv = {
      stockly: {} as any,
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockService = {
      getGainers: vi.fn(),
      getLosers: vi.fn(),
      getActives: vi.fn(),
      getSectorsPerformance: vi.fn(),
      getScreener: vi.fn(),
      getMarketStatus: vi.fn(),
    } as any;

    controller = new MarketController(mockService, mockLogger, mockEnv);
    vi.clearAllMocks();
  });

  describe('getGainers', () => {
    it('should return paginated gainers data successfully', async () => {
      // Arrange
      const mockData: MarketStockItem[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
        },
      ];

      vi.mocked(mockService.getGainers).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/market/gainers');

      // Act
      const response = await controller.getGainers(request);
      const json = await response.json();

      // Assert
      if (response.status !== 200) {
        // If error, fail with the error message
        expect(json).toBeDefined();
        throw new Error(`Expected 200 but got ${response.status}: ${JSON.stringify(json)}`);
      }
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('pagination');
      expect(json.data).toEqual(mockData);
      expect(json.pagination).toMatchObject({
        offset: 0,
        limit: 10,
        hasMore: expect.any(Boolean),
        total: expect.any(Number),
      });
      expect(PaginatedMarketResponseSchema.safeParse(json).success).toBe(true);
      expect(mockService.getGainers).toHaveBeenCalledWith(10, 0); // Default limit and offset
    });

    it('should respect limit and offset parameters', async () => {
      // Arrange
      const mockData: MarketStockItem[] = Array.from({ length: 20 }, (_, i) => ({
        symbol: `STOCK${i}`,
        name: `Stock ${i}`,
        price: 100 + i,
      }));

      vi.mocked(mockService.getGainers).mockResolvedValue(mockData.slice(0, 5));
      const request = new Request('https://example.com/v1/api/market/gainers?limit=5');

      // Act
      const response = await controller.getGainers(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('pagination');
      expect(json.data).toHaveLength(5);
      // Service should be called with limit=5, offset=0
      expect(mockService.getGainers).toHaveBeenCalledWith(5, 0);
    });

    it('should use default limit when not provided', async () => {
      // Arrange
      const mockData: MarketStockItem[] = [];
      vi.mocked(mockService.getGainers).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/market/gainers');

      // Act
      const response = await controller.getGainers(request);

      // Assert
      expect(response.status).toBe(200);
      const parsed = GetMarketRequestSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.limit).toBe(10);
      }
    });

    it('should return 400 for invalid limit (too low)', async () => {
      // Arrange
      const request = new Request('https://example.com/v1/api/market/gainers?limit=0');

      // Act
      const response = await controller.getGainers(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json.error).toBeDefined();
      expect(mockService.getGainers).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid limit (too high)', async () => {
      // Arrange
      const request = new Request('https://example.com/v1/api/market/gainers?limit=51');

      // Act
      const response = await controller.getGainers(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json.error).toBeDefined();
      expect(mockService.getGainers).not.toHaveBeenCalled();
    });

    it('should return 500 when service throws error', async () => {
      // Arrange
      vi.mocked(mockService.getGainers).mockRejectedValue(new Error('Service error'));
      const request = new Request('https://example.com/v1/api/market/gainers');

      // Act
      const response = await controller.getGainers(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getLosers', () => {
    it('should return losers data successfully', async () => {
      // Arrange
      const mockData: MarketStockItem[] = [
        {
          symbol: 'STOCK1',
          name: 'Losing Stock',
          price: 50.0,
          change: -5.0,
          changesPercentage: -9.09,
        },
      ];

      vi.mocked(mockService.getLosers).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/market/losers');

      // Act
      const response = await controller.getLosers(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('pagination');
      expect(json.data).toEqual(mockData);
      expect(PaginatedMarketResponseSchema.safeParse(json).success).toBe(true);
      expect(mockService.getLosers).toHaveBeenCalledWith(10, 0);
    });

    it('should return 400 for invalid limit', async () => {
      // Arrange
      const request = new Request('https://example.com/v1/api/market/losers?limit=-1');

      // Act
      const response = await controller.getLosers(request);

      // Assert
      expect(response.status).toBe(400);
      expect(mockService.getLosers).not.toHaveBeenCalled();
    });
  });

  describe('getActives', () => {
    it('should return actives data successfully', async () => {
      // Arrange
      const mockData: MarketStockItem[] = [
        {
          symbol: 'ACTIVE1',
          name: 'Active Stock',
          price: 100.0,
          volume: 5000000,
        },
      ];

      vi.mocked(mockService.getActives).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/market/actives');

      // Act
      const response = await controller.getActives(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('pagination');
      expect(json.data).toEqual(mockData);
      expect(PaginatedMarketResponseSchema.safeParse(json).success).toBe(true);
      expect(mockService.getActives).toHaveBeenCalledWith(10, 0);
    });

    it('should return 400 for invalid limit', async () => {
      // Arrange
      const request = new Request('https://example.com/v1/api/market/actives?limit=100');

      // Act
      const response = await controller.getActives(request);

      // Assert
      expect(response.status).toBe(400);
      expect(mockService.getActives).not.toHaveBeenCalled();
    });
  });

  describe('getSectorsPerformance', () => {
    it('should return sectors performance data successfully', async () => {
      // Arrange
      const mockData: SectorPerformanceItem[] = [
        {
          sector: 'Technology',
          changesPercentage: 2.5,
        },
        {
          sector: 'Energy',
          changesPercentage: -1.8,
        },
      ];

      vi.mocked(mockService.getSectorsPerformance).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/market/sectors-performance');

      // Act
      const response = await controller.getSectorsPerformance(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toEqual(mockData);
      expect(SectorsResponseSchema.safeParse(json).success).toBe(true);
      expect(mockService.getSectorsPerformance).toHaveBeenCalledTimes(1);
    });

    it('should return 500 when service fails', async () => {
      // Arrange
      vi.mocked(mockService.getSectorsPerformance).mockRejectedValue(new Error('Service error'));
      const request = new Request('https://example.com/v1/api/market/sectors-performance');

      // Act
      const response = await controller.getSectorsPerformance(request);

      // Assert
      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get sectors performance',
        expect.any(Error)
      );
    });

    it('should handle empty sectors array', async () => {
      // Arrange
      const mockData: SectorPerformanceItem[] = [];
      vi.mocked(mockService.getSectorsPerformance).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/market/sectors-performance');

      // Act
      const response = await controller.getSectorsPerformance(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toEqual([]);
    });
  });

  describe('getMarketStatus', () => {
    it('should return market status data successfully', async () => {
      // Arrange
      const mockData = { isTheStockMarketOpen: true };
      vi.mocked(mockService.getMarketStatus).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/market/status');

      // Act
      const response = await controller.getMarketStatus(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toEqual(mockData);
      expect(MarketStatusResponseSchema.safeParse(json).success).toBe(true);
      expect(mockService.getMarketStatus).toHaveBeenCalledTimes(1);
    });

    it('should return 500 when service fails', async () => {
      // Arrange
      vi.mocked(mockService.getMarketStatus).mockRejectedValue(new Error('Service error'));
      const request = new Request('https://example.com/v1/api/market/status');

      // Act
      const response = await controller.getMarketStatus(request);

      // Assert
      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get market status',
        expect.any(Error)
      );
    });

    it('should handle market closed status', async () => {
      // Arrange
      const mockData = { isTheStockMarketOpen: false };
      vi.mocked(mockService.getMarketStatus).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/market/status');

      // Act
      const response = await controller.getMarketStatus(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toEqual({ isTheStockMarketOpen: false });
    });
  });
});

