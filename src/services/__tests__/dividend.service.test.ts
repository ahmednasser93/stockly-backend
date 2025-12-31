/**
 * Dividend Service Tests
 * Tests service layer logic for dividend calculations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DividendService } from '../dividend.service';
import type { DividendRepository } from '../../repositories/external/DividendRepository';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';

describe('DividendService', () => {
  let service: DividendService;
  let mockRepository: DividendRepository;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockEnv = {
      stockly: {} as any,
      marketKv: {
        get: vi.fn(),
        put: vi.fn(),
      } as any,
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockRepository = {
      getHistoricalDividends: vi.fn(),
      getCurrentYield: vi.fn(),
    } as any;

    service = new DividendService(mockRepository, mockEnv, mockLogger);
    vi.clearAllMocks();
  });

  describe('calculateDGR', () => {
    it('should calculate DGR from 5 years of data', () => {
      // Arrange
      const historicalDividends = [
        { date: '2020-01-01', dividend: 1.0 },
        { date: '2020-04-01', dividend: 1.0 },
        { date: '2021-01-01', dividend: 1.1 },
        { date: '2021-04-01', dividend: 1.1 },
        { date: '2022-01-01', dividend: 1.2 },
        { date: '2022-04-01', dividend: 1.2 },
        { date: '2023-01-01', dividend: 1.3 },
        { date: '2023-04-01', dividend: 1.3 },
        { date: '2024-01-01', dividend: 1.4 },
        { date: '2024-04-01', dividend: 1.4 },
      ];

      // Act
      const dgr = service.calculateDGR(historicalDividends);

      // Assert
      expect(dgr).not.toBeNull();
      expect(dgr).toBeGreaterThan(0);
      expect(dgr).toBeLessThan(1);
    });

    it('should return null for insufficient data', () => {
      // Arrange
      const historicalDividends = [
        { date: '2024-01-01', dividend: 1.0 },
      ];

      // Act
      const dgr = service.calculateDGR(historicalDividends);

      // Assert
      expect(dgr).toBeNull();
    });

    it('should handle negative DGR (dividend cuts)', () => {
      // Arrange
      const historicalDividends = [
        { date: '2020-01-01', dividend: 2.0 },
        { date: '2021-01-01', dividend: 1.5 },
        { date: '2022-01-01', dividend: 1.0 },
      ];

      // Act
      const dgr = service.calculateDGR(historicalDividends);

      // Assert
      expect(dgr).not.toBeNull();
      expect(dgr).toBeLessThan(0);
    });
  });

  describe('calculateProjection', () => {
    it('should calculate projection with reinvestment correctly', () => {
      // Act
      const result = service.calculateProjection({
        symbol: 'KO',
        initialInvestment: 10000,
        currentYield: 0.03,
        dividendGrowthRate: 0.05,
        years: 10,
      });

      // Assert
      expect(result.years).toHaveLength(10);
      expect(result.totalDividendsReinvested).toBeGreaterThan(0);
      expect(result.totalDividendsSpent).toBeGreaterThan(0);
      expect(result.finalPrincipalReinvested).toBeGreaterThan(10000);
      expect(result.totalDividendsReinvested).toBeGreaterThan(result.totalDividendsSpent);
    });

    it('should generate insight message', () => {
      // Act
      const result = service.calculateProjection({
        symbol: 'KO',
        initialInvestment: 10000,
        currentYield: 0.03,
        dividendGrowthRate: 0.05,
        years: 10,
      });

      // Assert
      expect(result.insight).toBeTruthy();
      expect(result.insight.length).toBeGreaterThan(0);
    });

    it('should throw error for invalid parameters', () => {
      // Assert
      expect(() => {
        service.calculateProjection({
          symbol: 'KO',
          initialInvestment: 0,
          currentYield: 0.03,
          dividendGrowthRate: 0.05,
          years: 10,
        });
      }).toThrow();
    });
  });
});

