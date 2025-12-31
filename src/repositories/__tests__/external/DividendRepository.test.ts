/**
 * Dividend Repository Tests
 * Tests repository layer for fetching dividend data from FMP API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DividendRepository } from '../../external/DividendRepository';
import type { Env } from '../../../index';
import type { Logger } from '../../../logging/logger';

// Mock fetch globally
global.fetch = vi.fn();

describe('DividendRepository', () => {
  let repository: DividendRepository;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockEnv = {
      stockly: {} as any,
      FMP_API_KEY: 'test-api-key',
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    repository = new DividendRepository(mockEnv, mockLogger);
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('getHistoricalDividends', () => {
    it('should fetch historical dividends successfully', async () => {
      // Arrange
      const mockResponse = {
        historical: [
          { date: '2024-01-15', dividend: 0.46 },
          { date: '2023-10-15', dividend: 0.44 },
          { date: '2023-07-15', dividend: 0.44 },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      // Act
      const result = await repository.getHistoricalDividends('KO');

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].dividend).toBe(0.46);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/historical-price-full/stock_dividend/KO'),
        expect.any(Object)
      );
    });

    it('should handle empty dividend history', async () => {
      // Arrange
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ historical: [] }),
      } as Response);

      // Act
      const result = await repository.getHistoricalDividends('TEST');

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle 404 response (no data)', async () => {
      // Arrange - 404 returns null from fetchWithRetry, which returns empty array
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response);

      // Act
      const result = await repository.getHistoricalDividends('NODIV');

      // Assert - fetchWithRetry returns null for 404, which is handled as empty array
      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      // Arrange
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      // Act & Assert
      await expect(repository.getHistoricalDividends('KO')).rejects.toThrow();
    });

    it('should handle rate limiting with retry', async () => {
      // Arrange
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ historical: [] }),
        } as Response);

      // Act
      const result = await repository.getHistoricalDividends('KO');

      // Assert
      expect(result).toEqual([]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCurrentYield', () => {
    it('should extract yield directly from profile', async () => {
      // Arrange
      const mockResponse = [
        {
          symbol: 'KO',
          dividendYield: 3.5,
          price: 60,
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      // Act
      const result = await repository.getCurrentYield('KO');

      // Assert
      expect(result).toBe(0.035); // 3.5% = 0.035
    });

    it('should calculate yield from lastDiv and price', async () => {
      // Arrange
      const mockResponse = [
        {
          symbol: 'KO',
          lastDiv: 0.46,
          price: 60,
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      // Act
      const result = await repository.getCurrentYield('KO');

      // Assert
      // 0.46 quarterly * 4 = 1.84 annually / 60 = 0.03067
      // But the formula is (lastDiv / price) * 4, so (0.46 / 60) * 4 = 0.03067
      expect(result).toBeCloseTo((0.46 / 60) * 4, 4);
    });

    it('should return null if no dividend data', async () => {
      // Arrange
      const mockResponse = [
        {
          symbol: 'BRK.A',
          price: 500000,
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      // Act
      const result = await repository.getCurrentYield('BRK.A');

      // Assert
      expect(result).toBeNull();
    });

    it('should handle 404 response', async () => {
      // Arrange
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response);

      // Act
      const result = await repository.getCurrentYield('INVALID');

      // Assert
      expect(result).toBeNull();
    });
  });
});

