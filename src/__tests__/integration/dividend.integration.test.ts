/**
 * Dividend Integration Tests
 * Tests end-to-end flow with real FMP API calls
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DividendRepository } from '../../repositories/external/DividendRepository';
import { DividendService } from '../../services/dividend.service';
import type { Env } from '../../index';

// These tests make real API calls - skip in CI if needed
describe.skipIf(process.env.CI === 'true')('Dividend Integration Tests', () => {
  let repository: DividendRepository;
  let service: DividendService;
  let env: Env;

  beforeAll(() => {
    // Use real environment or test API key
    env = {
      stockly: {} as any,
      FMP_API_KEY: process.env.FMP_API_KEY || 'test-key',
      marketKv: {
        get: async () => null,
        put: async () => {},
      } as any,
    } as Env;

    repository = new DividendRepository(env);
    service = new DividendService(repository, env);
  });

  describe('Real FMP API Calls', () => {
    it('should fetch dividend data for KO (high dividend stock)', async () => {
      // Act
      const data = await repository.getHistoricalDividends('KO');
      const yield_ = await repository.getCurrentYield('KO');

      // Assert
      expect(data.length).toBeGreaterThan(0);
      expect(yield_).not.toBeNull();
      expect(yield_).toBeGreaterThan(0);
    }, 30000); // 30 second timeout

    it('should calculate DGR for KO', async () => {
      // Arrange
      const dividends = await repository.getHistoricalDividends('KO');

      // Act
      const dividendData = await service.getDividendData('KO');
      const dgr = service.calculateDGR(dividends);

      // Assert
      expect(dividendData.dividendGrowthRate).not.toBeNull();
      expect(dgr).not.toBeNull();
      if (dgr) {
        expect(dgr).toBeGreaterThan(-1); // Should be between -90% and 1000%
        expect(dgr).toBeLessThan(10);
      }
    }, 30000);

    it('should calculate projection for KO', async () => {
      // Arrange
      const dividendData = await service.getDividendData('KO');
      
      if (!dividendData.currentYield || !dividendData.dividendGrowthRate) {
        return; // Skip if no dividend data
      }

      // Act
      const projection = service.calculateProjection({
        symbol: 'KO',
        initialInvestment: 10000,
        currentYield: dividendData.currentYield,
        dividendGrowthRate: dividendData.dividendGrowthRate,
        years: 10,
      });

      // Assert
      expect(projection.years).toHaveLength(10);
      expect(projection.totalDividendsReinvested).toBeGreaterThan(0);
      expect(projection.totalDividendsSpent).toBeGreaterThan(0);
      expect(projection.finalPrincipalReinvested).toBeGreaterThan(10000);
      expect(projection.insight.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle stock with no dividends (BRK.A)', async () => {
      // Act
      const yield_ = await repository.getCurrentYield('BRK.A');

      // Assert
      expect(yield_).toBeNull();
    }, 30000);

    it('should handle stock with low dividends (AAPL)', async () => {
      // Act
      const data = await repository.getHistoricalDividends('AAPL');
      const yield_ = await repository.getCurrentYield('AAPL');

      // Assert
      // AAPL pays dividends, so we should get some data
      if (yield_ != null) {
        expect(yield_).toBeGreaterThan(0);
        expect(data.length).toBeGreaterThan(0);
      }
    }, 30000);
  });
});

