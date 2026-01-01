/**
 * Calendar Repository Tests
 * Tests data access layer with mocked external API calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarRepository } from '../../external/CalendarRepository';
import type { Env } from '../../../index';
import type { Logger } from '../../../logging/logger';
import { API_URL, API_KEY } from '../../../util';

// Mock global fetch
global.fetch = vi.fn();

describe('CalendarRepository', () => {
  let repository: CalendarRepository;
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

    repository = new CalendarRepository(mockEnv, mockLogger);
    vi.clearAllMocks();
  });

  describe('getEarningsCalendar', () => {
    it('should fetch earnings calendar from FMP API', async () => {
      // Arrange
      const mockResponse = [
        { symbol: 'AAPL', date: '2024-01-01', eps: 1.5 },
        { symbol: 'MSFT', date: '2024-01-02', eps: 2.0 },
      ];

      const mockApiResponse = {
        ok: true,
        json: async () => mockResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getEarningsCalendar();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[1].symbol).toBe('MSFT');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_URL}/earning_calendar`),
        expect.any(Object)
      );
    });

    it('should handle date range parameters', async () => {
      // Arrange
      const mockResponse: any[] = [];
      const mockApiResponse = {
        ok: true,
        json: async () => mockResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      await repository.getEarningsCalendar('2024-01-01', '2024-01-31');

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('from=2024-01-01'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('to=2024-01-31'),
        expect.any(Object)
      );
    });
  });

  describe('getDividendCalendar', () => {
    it('should fetch dividend calendar from FMP API', async () => {
      // Arrange
      const mockResponse = [
        { symbol: 'AAPL', date: '2024-01-15', dividend: 0.24 },
      ];

      const mockApiResponse = {
        ok: true,
        json: async () => mockResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getDividendCalendar();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('AAPL');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_URL}/stock_dividend_calendar`),
        expect.any(Object)
      );
    });
  });

  describe('getIPOCalendar', () => {
    it('should fetch IPO calendar from FMP API', async () => {
      // Arrange
      const mockResponse = [
        { symbol: 'NEWCO', date: '2024-02-01', name: 'New Company Inc.' },
      ];

      const mockApiResponse = {
        ok: true,
        json: async () => mockResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getIPOCalendar();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('NEWCO');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_URL}/ipo_calendar`),
        expect.any(Object)
      );
    });
  });

  describe('getStockSplitCalendar', () => {
    it('should fetch stock split calendar from FMP API', async () => {
      // Arrange
      const mockResponse = [
        { symbol: 'AAPL', date: '2024-03-01', ratio: '2:1' },
      ];

      const mockApiResponse = {
        ok: true,
        json: async () => mockResponse,
      } as Response;

      vi.mocked(global.fetch).mockResolvedValue(mockApiResponse);

      // Act
      const result = await repository.getStockSplitCalendar();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('AAPL');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_URL}/stock_split_calendar`),
        expect.any(Object)
      );
    });
  });
});

