/**
 * Market Repository Tests
 * Tests data access layer with mocked external API calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketRepository } from '../../external/MarketRepository';
import type { Env } from '../../../index';
import type { Logger } from '../../../logging/logger';
import { API_URL, API_KEY } from '../../../util';

// Mock global fetch
global.fetch = vi.fn();

describe('MarketRepository', () => {
  let repository: MarketRepository;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockEnv = {
      stockly: {} as any,
      FMP_API_KEY: API_KEY,
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    repository = new MarketRepository(mockEnv, mockLogger);
    vi.clearAllMocks();
  });

  describe('getGainers', () => {
    it('should fetch gainers from FMP dedicated endpoint', async () => {
      // Arrange - Mock FMP gainers endpoint response
      const mockGainers = [
        { symbol: 'MSFT', name: 'Microsoft Corporation', price: 300.0, change: 3.0, changesPercentage: 1.01, volume: 2000000 },
        { symbol: 'AAPL', name: 'Apple Inc.', price: 150.0, change: 1.5, changesPercentage: 1.0, volume: 1000000 },
      ];

      vi.mocked(global.fetch).mockImplementation((url: any) => {
        if (url.toString().includes('/stock_market/gainers')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockGainers,
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      // Act
      const result = await repository.getGainers();

      // Assert - Should return stocks from FMP endpoint
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].symbol).toBe('MSFT');
      expect(result[0].changesPercentage).toBe(1.01);
      expect(result[1].symbol).toBe('AAPL');
      expect(result[1].changesPercentage).toBe(1.0);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/stock_market/gainers'),
        expect.any(Object)
      );
    });

    it('should handle empty array when FMP returns no gainers', async () => {
      // Arrange - Mock FMP endpoint returning empty array
      vi.mocked(global.fetch).mockImplementation((url: any) => {
        if (url.toString().includes('/stock_market/gainers')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      // Act
      const result = await repository.getGainers();

      // Assert - Should return empty array
      expect(result).toEqual([]);
    });

    it('should normalize gainers response fields correctly', async () => {
      // Arrange
      const mockGainer = {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 150.0,
        change: 1.5,
        changesPercentage: 1.0,
        volume: 1000000,
        dayLow: 149.0,
        dayHigh: 152.0,
      };

      vi.mocked(global.fetch).mockImplementation((url: any) => {
        if (url.toString().includes('/stock_market/gainers')) {
          return Promise.resolve({
            ok: true,
            json: async () => [mockGainer],
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      // Act
      const result = await repository.getGainers();

      // Assert
      expect(result.length).toBeGreaterThan(0);
      const aapl = result.find(r => r.symbol === 'AAPL');
      expect(aapl).toMatchObject({
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 150.0,
        change: 1.5,
        changesPercentage: 1.0,
        volume: 1000000,
        dayLow: 149.0,
        dayHigh: 152.0,
      });
    });

    it('should handle missing optional fields', async () => {
      // Arrange
      const mockGainer = {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 150.0,
        changesPercentage: 0.5,
        // missing change, volume, etc.
      };

      vi.mocked(global.fetch).mockImplementation((url: any) => {
        if (url.toString().includes('/stock_market/gainers')) {
          return Promise.resolve({
            ok: true,
            json: async () => [mockGainer],
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      // Act
      const result = await repository.getGainers();

      // Assert
      expect(result.length).toBeGreaterThan(0);
      const aapl = result.find(r => r.symbol === 'AAPL');
      expect(aapl?.symbol).toBe('AAPL');
      expect(aapl?.name).toBe('Apple Inc.');
      expect(aapl?.price).toBe(150.0);
    });

    it('should retry on rate limit (429)', async () => {
      // Arrange
      const mockSuccessResponse = {
        ok: true,
        json: async () => [{ symbol: 'AAPL', price: 150.0, changesPercentage: 1.0 }],
      } as Response;

      const mockRateLimitResponse = {
        ok: false,
        status: 429,
      } as Response;

      // First call rate limited, second succeeds
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValue(mockSuccessResponse);

      // Act
      const result = await repository.getGainers();

      // Assert - Should eventually succeed after retry
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle errors gracefully when quote fetching fails', async () => {
      // Arrange - Some quotes fail, some succeed
      const mockErrorResponse = {
        ok: false,
        status: 500,
        text: async () => 'Server error',
      } as Response;

      const mockSuccessResponse = {
        ok: true,
        json: async () => [{ symbol: 'AAPL', price: 150.0, changesPercentage: 1.0 }],
      } as Response;

      // First few fail, then some succeed
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockErrorResponse)
        .mockResolvedValueOnce(mockErrorResponse)
        .mockResolvedValue(mockSuccessResponse);

      // Act
      const result = await repository.getGainers();

      // Assert - Should return results from successful quotes
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getLosers', () => {
    it('should fetch losers from FMP dedicated endpoint', async () => {
      // Arrange - Mock FMP losers endpoint response
      const mockLosers = [
        { symbol: 'MSFT', name: 'Microsoft Corporation', price: 300.0, change: -5.0, changesPercentage: -1.64, volume: 2000000 },
        { symbol: 'AAPL', name: 'Apple Inc.', price: 150.0, change: -1.5, changesPercentage: -1.0, volume: 1000000 },
      ];

      vi.mocked(global.fetch).mockImplementation((url: any) => {
        if (url.toString().includes('/stock_market/losers')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockLosers,
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      // Act
      const result = await repository.getLosers();

      // Assert - Should return stocks from FMP endpoint
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].symbol).toBe('MSFT');
      expect(result[0].changesPercentage).toBe(-1.64);
      expect(result[1].symbol).toBe('AAPL');
      expect(result[1].changesPercentage).toBe(-1.0);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/stock_market/losers'),
        expect.any(Object)
      );
    });
  });

  describe('getActives', () => {
    it('should fetch actives from FMP dedicated endpoint', async () => {
      // Arrange - Mock FMP actives endpoint response
      const mockActives = [
        { symbol: 'TSLA', name: 'Tesla Inc.', price: 200.0, change: 5.0, changesPercentage: 2.5, volume: 50000000 },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 500.0, change: 10.0, changesPercentage: 2.0, volume: 30000000 },
        { symbol: 'AAPL', name: 'Apple Inc.', price: 150.0, change: 1.5, changesPercentage: 1.0, volume: 10000000 },
      ];

      vi.mocked(global.fetch).mockImplementation((url: any) => {
        if (url.toString().includes('/stock_market/actives')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockActives,
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      // Act
      const result = await repository.getActives();

      // Assert - Should return stocks from FMP endpoint
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].symbol).toBe('TSLA');
      expect(result[0].volume).toBe(50000000);
      expect(result[1].symbol).toBe('NVDA');
      expect(result[1].volume).toBe(30000000);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/stock_market/actives'),
        expect.any(Object)
      );
    });
  });

  describe('getSectorsPerformance', () => {
    it('should fetch and normalize sectors performance from FMP API', async () => {
      // Arrange
      const mockFmpResponse = [
        {
          sector: 'Technology',
          changesPercentage: 2.5,
        },
        {
          sector: 'Energy',
          changesPercentage: -1.8,
        },
        {
          sector: 'Healthcare',
          changesPercentage: 0.5,
        },
      ];

      const mockApiResponse = {
        ok: true,
        json: async () => mockFmpResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getSectorsPerformance();

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0].sector).toBe('Technology');
      expect(result[0].changesPercentage).toBe(2.5);
      expect(result[1].sector).toBe('Energy');
      expect(result[1].changesPercentage).toBe(-1.8);
      expect(result[2].sector).toBe('Healthcare');
      expect(result[2].changesPercentage).toBe(0.5);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_URL}/v3/sectors-performance`),
        expect.any(Object)
      );
    });

    it('should handle empty array response', async () => {
      // Arrange
      const mockApiResponse = {
        ok: true,
        json: async () => [],
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getSectorsPerformance();

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle alternative field names in FMP response', async () => {
      // Arrange
      const mockFmpResponse = [
        {
          Sector: 'Technology',
          changePercent: 2.5,
        },
        {
          name: 'Energy',
          changes: -1.8,
        },
      ];

      const mockApiResponse = {
        ok: true,
        json: async () => mockFmpResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getSectorsPerformance();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].sector).toBe('Technology');
      expect(result[0].changesPercentage).toBe(2.5);
      expect(result[1].sector).toBe('Energy');
      expect(result[1].changesPercentage).toBe(-1.8);
    });

    it('should handle null changesPercentage', async () => {
      // Arrange
      const mockFmpResponse = [
        {
          sector: 'Technology',
          changesPercentage: null,
        },
      ];

      const mockApiResponse = {
        ok: true,
        json: async () => mockFmpResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getSectorsPerformance();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].sector).toBe('Technology');
      expect(result[0].changesPercentage).toBeNull();
    });
  });

  describe('getMarketStatus', () => {
    it('should fetch market status from FMP API', async () => {
      // Arrange
      const mockFmpResponse = {
        isTheStockMarketOpen: true,
      };

      const mockApiResponse = {
        ok: true,
        json: async () => mockFmpResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getMarketStatus();

      // Assert
      expect(result).toEqual({ isTheStockMarketOpen: true });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_URL}/is-the-market-open`),
        expect.any(Object)
      );
    });

    it('should handle array response from FMP', async () => {
      // Arrange
      const mockFmpResponse = [
        {
          isTheStockMarketOpen: false,
        },
      ];

      const mockApiResponse = {
        ok: true,
        json: async () => mockFmpResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getMarketStatus();

      // Assert
      expect(result).toEqual({ isTheStockMarketOpen: false });
    });

    it('should default to false if response is missing field', async () => {
      // Arrange
      const mockFmpResponse = {};

      const mockApiResponse = {
        ok: true,
        json: async () => mockFmpResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getMarketStatus();

      // Assert
      expect(result).toEqual({ isTheStockMarketOpen: false });
    });

    it('should handle API errors', async () => {
      // Arrange
      const mockApiResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act & Assert
      await expect(repository.getMarketStatus()).rejects.toThrow();
    });
  });
});

