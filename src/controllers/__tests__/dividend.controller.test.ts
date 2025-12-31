/**
 * Dividend Controller Tests
 * Tests controller endpoint logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DividendController } from '../dividend.controller';
import type { DividendService } from '../../services/dividend.service';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import { createErrorResponse } from '../../auth/error-handler';
import type { DividendData, ProjectionResult } from '../../services/dividend.service';

describe('DividendController', () => {
  let controller: DividendController;
  let mockService: DividendService;
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
      getDividendData: vi.fn(),
      calculateProjection: vi.fn(),
    } as any;

    controller = new DividendController(mockService, mockLogger, mockEnv);
    vi.clearAllMocks();
  });

  describe('getDividendData', () => {
    it('should return dividend data successfully', async () => {
      // Arrange
      const mockData: DividendData = {
        symbol: 'KO',
        currentYield: 0.03,
        dividendGrowthRate: 0.05,
        last5YearsDividends: [],
        hasInsufficientData: false,
      };

      vi.mocked(mockService.getDividendData).mockResolvedValue(mockData);
      const request = new Request('https://example.com/v1/api/dividends/data?symbol=KO');

      // Act
      const response = await controller.getDividendData(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toEqual(mockData);
      expect(mockService.getDividendData).toHaveBeenCalledWith('KO');
    });

    it('should return 400 if symbol is missing', async () => {
      // Arrange
      const request = new Request('https://example.com/v1/api/dividends/data');

      // Act
      const response = await controller.getDividendData(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json).toHaveProperty('error');
      expect(mockService.getDividendData).not.toHaveBeenCalled();
    });

    it('should return 400 if symbol is too long', async () => {
      // Arrange
      const request = new Request('https://example.com/v1/api/dividends/data?symbol=VERYLONGSYMBOLNAME');

      // Act
      const response = await controller.getDividendData(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json).toHaveProperty('error');
    });

    it('should handle service errors', async () => {
      // Arrange
      vi.mocked(mockService.getDividendData).mockRejectedValue(new Error('Service error'));
      const request = new Request('https://example.com/v1/api/dividends/data?symbol=KO');

      // Act
      const response = await controller.getDividendData(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(json).toHaveProperty('error');
    });
  });

  describe('calculateProjection', () => {
    it('should return projection result successfully', async () => {
      // Arrange
      const mockProjection: ProjectionResult = {
        years: [],
        totalDividendsReinvested: 5000,
        totalDividendsSpent: 3000,
        finalPrincipalReinvested: 15000,
        insight: 'Test insight',
      };

      const mockDividendData: DividendData = {
        symbol: 'KO',
        currentYield: 0.03,
        dividendGrowthRate: 0.05,
        last5YearsDividends: [],
        hasInsufficientData: false,
      };

      vi.mocked(mockService.getDividendData).mockResolvedValue(mockDividendData);
      vi.mocked(mockService.calculateProjection).mockReturnValue(mockProjection);

      const request = new Request('https://example.com/v1/api/dividends/project', {
        method: 'POST',
        body: JSON.stringify({
          symbol: 'KO',
          initialInvestment: 10000,
          years: 10,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await controller.calculateProjection(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toEqual(mockProjection);
    });

    it('should return 400 if symbol is missing', async () => {
      // Arrange
      const request = new Request('https://example.com/v1/api/dividends/project', {
        method: 'POST',
        body: JSON.stringify({
          initialInvestment: 10000,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await controller.calculateProjection(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json).toHaveProperty('error');
    });

    it('should return 400 if initialInvestment is below minimum', async () => {
      // Arrange
      const request = new Request('https://example.com/v1/api/dividends/project', {
        method: 'POST',
        body: JSON.stringify({
          symbol: 'KO',
          initialInvestment: 50,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await controller.calculateProjection(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json).toHaveProperty('error');
    });

    it('should return 404 if stock has no dividends', async () => {
      // Arrange
      const mockDividendData: DividendData = {
        symbol: 'BRK.A',
        currentYield: null,
        dividendGrowthRate: null,
        last5YearsDividends: [],
        hasInsufficientData: true,
      };

      vi.mocked(mockService.getDividendData).mockResolvedValue(mockDividendData);

      const request = new Request('https://example.com/v1/api/dividends/project', {
        method: 'POST',
        body: JSON.stringify({
          symbol: 'BRK.A',
          initialInvestment: 10000,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await controller.calculateProjection(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(json).toHaveProperty('error');
    });

    it('should return 400 if insufficient data', async () => {
      // Arrange
      const mockDividendData: DividendData = {
        symbol: 'TEST',
        currentYield: 0.02,
        dividendGrowthRate: null,
        last5YearsDividends: [],
        hasInsufficientData: true,
      };

      vi.mocked(mockService.getDividendData).mockResolvedValue(mockDividendData);

      const request = new Request('https://example.com/v1/api/dividends/project', {
        method: 'POST',
        body: JSON.stringify({
          symbol: 'TEST',
          initialInvestment: 10000,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await controller.calculateProjection(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json).toHaveProperty('error');
    });
  });
});

