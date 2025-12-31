/**
 * Dividend Service Edge Cases Tests
 * Tests edge cases and boundary conditions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DividendService } from '../dividend.service';
import type { DividendRepository } from '../../repositories/external/DividendRepository';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';

describe('DividendService - Edge Cases', () => {
  let service: DividendService;
  let mockRepository: DividendRepository;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockRepository = {
      getHistoricalDividends: vi.fn(),
      getCurrentYield: vi.fn(),
    } as any;

    mockEnv = {
      stockly: {} as any,
      marketKv: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      } as any,
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    service = new DividendService(mockRepository, mockEnv, mockLogger);
  });

  describe('calculateDGR - Edge Cases', () => {
    it('should handle zero DGR (no growth)', () => {
      // Arrange
      const dividends = [
        { date: '2020-01-15', dividend: 1.0 },
        { date: '2021-01-15', dividend: 1.0 },
        { date: '2022-01-15', dividend: 1.0 },
        { date: '2023-01-15', dividend: 1.0 },
        { date: '2024-01-15', dividend: 1.0 },
      ];

      // Act
      const dgr = service.calculateDGR(dividends);

      // Assert
      expect(dgr).toBeCloseTo(0, 4);
    });

    it('should handle negative DGR (dividend cuts)', () => {
      // Arrange
      const dividends = [
        { date: '2020-01-15', dividend: 2.0 },
        { date: '2021-01-15', dividend: 1.8 },
        { date: '2022-01-15', dividend: 1.6 },
        { date: '2023-01-15', dividend: 1.4 },
        { date: '2024-01-15', dividend: 1.2 },
      ];

      // Act
      const dgr = service.calculateDGR(dividends);

      // Assert
      expect(dgr).toBeLessThan(0);
      expect(dgr).toBeGreaterThan(-0.9); // Should be clamped to -90%
    });

    it('should handle very high DGR (>50%)', () => {
      // Arrange
      const dividends = [
        { date: '2020-01-15', dividend: 1.0 },
        { date: '2021-01-15', dividend: 2.0 },
        { date: '2022-01-15', dividend: 3.0 },
        { date: '2023-01-15', dividend: 4.0 },
        { date: '2024-01-15', dividend: 5.0 },
      ];

      // Act
      const dgr = service.calculateDGR(dividends);

      // Assert
      expect(dgr).toBeGreaterThan(0);
      expect(dgr).toBeLessThan(10); // Should be clamped to 1000%
    });

    it('should handle zero yield', async () => {
      // Arrange
      vi.mocked(mockRepository.getHistoricalDividends).mockResolvedValue([]);
      vi.mocked(mockRepository.getCurrentYield).mockResolvedValue(null);

      // Act
      const result = await service.getDividendData('BRK.A');

      // Assert
      expect(result.currentYield).toBeNull();
      expect(result.dividendGrowthRate).toBeNull();
      expect(result.hasInsufficientData).toBe(true);
    });

    it('should handle very large initial investment', async () => {
      // Arrange
      const dividendData = {
        symbol: 'KO',
        currentYield: 0.03,
        dividendGrowthRate: 0.05,
        last5YearsDividends: [],
        hasInsufficientData: false,
      };
      vi.mocked(mockRepository.getHistoricalDividends).mockResolvedValue([]);
      vi.mocked(mockRepository.getCurrentYield).mockResolvedValue(0.03);
      vi.mocked(mockEnv.marketKv!.get).mockResolvedValue(null);

      await service.getDividendData('KO');

      // Act - Very large investment (1 billion)
      const projection = service.calculateProjection({
        symbol: 'KO',
        initialInvestment: 1000000000, // 1 billion
        currentYield: 0.03,
        dividendGrowthRate: 0.05,
        years: 10,
      });

      // Assert
      expect(projection.totalDividendsReinvested).toBeGreaterThan(0);
      expect(Number.isFinite(projection.totalDividendsReinvested)).toBe(true);
      expect(projection.finalPrincipalReinvested).toBeGreaterThan(1000000000);
    });

    it('should handle very small initial investment', async () => {
      // Arrange
      const dividendData = {
        symbol: 'KO',
        currentYield: 0.03,
        dividendGrowthRate: 0.05,
        last5YearsDividends: [],
        hasInsufficientData: false,
      };
      vi.mocked(mockRepository.getHistoricalDividends).mockResolvedValue([]);
      vi.mocked(mockRepository.getCurrentYield).mockResolvedValue(0.03);
      vi.mocked(mockEnv.marketKv!.get).mockResolvedValue(null);

      await service.getDividendData('KO');

      // Act - Very small investment (1 dollar)
      const projection = service.calculateProjection({
        symbol: 'KO',
        initialInvestment: 1,
        currentYield: 0.03,
        dividendGrowthRate: 0.05,
        years: 10,
      });

      // Assert
      expect(projection.totalDividendsReinvested).toBeGreaterThan(0);
      expect(projection.totalDividendsReinvested).toBeLessThan(1); // Should be small
    });

    it('should handle single year of data', () => {
      // Arrange
      const dividends = [
        { date: '2024-01-15', dividend: 1.0 },
      ];

      // Act
      const dgr = service.calculateDGR(dividends);

      // Assert
      expect(dgr).toBeNull(); // Need at least 2 years
    });

    it('should handle missing dividend data in some years', () => {
      // Arrange
      const dividends = [
        { date: '2020-01-15', dividend: 1.0 },
        { date: '2022-01-15', dividend: 1.1 }, // Missing 2021
        { date: '2023-01-15', dividend: 1.2 },
        { date: '2024-01-15', dividend: 1.3 },
      ];

      // Act
      const dgr = service.calculateDGR(dividends);

      // Assert
      expect(dgr).not.toBeNull();
      expect(dgr).toBeGreaterThan(0);
    });

    it('should handle projection with zero DGR', async () => {
      // Arrange
      const projection = service.calculateProjection({
        symbol: 'TEST',
        initialInvestment: 10000,
        currentYield: 0.03,
        dividendGrowthRate: 0, // Zero growth
        years: 10,
      });

      // Assert
      expect(projection.years.length).toBe(10);
      // Reinvested should still grow due to compounding, but linearly
      expect(projection.totalDividendsReinvested).toBeGreaterThan(projection.totalDividendsSpent);
    });

    it('should handle projection with negative DGR', async () => {
      // Arrange
      const projection = service.calculateProjection({
        symbol: 'TEST',
        initialInvestment: 10000,
        currentYield: 0.03,
        dividendGrowthRate: -0.05, // Negative growth (dividend cuts)
        years: 10,
      });

      // Assert
      expect(projection.years.length).toBe(10);
      // Dividends should decrease over time
      const firstYear = projection.years[0];
      const lastYear = projection.years[9];
      expect(lastYear.dividendReinvested).toBeLessThan(firstYear.dividendReinvested * 2);
    });
  });

  describe('generateInsight - Edge Cases', () => {
    it('should generate insight for very small dividend', () => {
      // Arrange
      const symbol = 'TEST';
      const totalReinvested = 10; // Very small
      const totalSpent = 10;
      const years = 10;

      // Act
      const insight = service.generateInsight(symbol, totalReinvested, totalSpent, years);

      // Assert
      expect(insight).toContain(symbol);
      expect(insight.length).toBeGreaterThan(0);
    });

    it('should generate insight for very large dividend', () => {
      // Arrange
      const symbol = 'TEST';
      const totalReinvested = 1000000; // Very large
      const totalSpent = 1000000;
      const years = 10;

      // Act
      const insight = service.generateInsight(symbol, totalReinvested, totalSpent, years);

      // Assert
      expect(insight).toContain(symbol);
      expect(insight).toContain('monthly');
      expect(insight.length).toBeGreaterThan(0);
    });
  });
});

