/**
 * Config Tests
 * Tests AdminConfig merging and default values
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConfig, updateConfig, clearConfigCache, DEFAULT_CONFIG } from '../config';
import type { Env } from '../../index';

describe('Config', () => {
  let mockEnv: Env;
  let mockKv: any;

  beforeEach(() => {
    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
    };

    mockEnv = {
      stockly: {} as any,
      alertsKv: mockKv,
    } as Env;

    clearConfigCache();
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return default config with newsTtlSec and prefetchCronInterval', async () => {
      // Arrange
      vi.mocked(mockKv.get).mockResolvedValue(null);

      // Act
      const config = await getConfig(mockEnv);

      // Assert
      expect(config.marketCache?.newsTtlSec).toBe(3600);
      expect(config.marketCache?.prefetchCronInterval).toBe('0 * * * *');
      expect(config.marketCache?.marketDataTtlSec).toBe(300);
      expect(config.marketCache?.sectorsTtlSec).toBe(2700);
    });

    it('should merge partial marketCache updates with defaults', async () => {
      // Arrange
      const storedConfig = {
        marketCache: {
          marketDataTtlSec: 600, // Only update this field
        },
      };
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(storedConfig));

      // Act
      const config = await getConfig(mockEnv);

      // Assert
      expect(config.marketCache?.marketDataTtlSec).toBe(600);
      expect(config.marketCache?.sectorsTtlSec).toBe(2700); // Default
      expect(config.marketCache?.newsTtlSec).toBe(3600); // Default
      expect(config.marketCache?.prefetchCronInterval).toBe('0 * * * *'); // Default
    });

    it('should preserve all marketCache fields when fully specified', async () => {
      // Arrange
      const storedConfig = {
        marketCache: {
          marketDataTtlSec: 600,
          sectorsTtlSec: 3600,
          newsTtlSec: 1800,
          prefetchCronInterval: '0 */2 * * *',
        },
      };
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(storedConfig));

      // Act
      const config = await getConfig(mockEnv);

      // Assert
      expect(config.marketCache?.marketDataTtlSec).toBe(600);
      expect(config.marketCache?.sectorsTtlSec).toBe(3600);
      expect(config.marketCache?.newsTtlSec).toBe(1800);
      expect(config.marketCache?.prefetchCronInterval).toBe('0 */2 * * *');
    });

    it('should handle missing marketCache in stored config', async () => {
      // Arrange
      const storedConfig = {
        pollingIntervalSec: 60,
        // No marketCache
      };
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(storedConfig));

      // Act
      const config = await getConfig(mockEnv);

      // Assert
      expect(config.marketCache?.marketDataTtlSec).toBe(300);
      expect(config.marketCache?.sectorsTtlSec).toBe(2700);
      expect(config.marketCache?.newsTtlSec).toBe(3600);
      expect(config.marketCache?.prefetchCronInterval).toBe('0 * * * *');
    });
  });

  describe('updateConfig', () => {
    it('should update only newsTtlSec in marketCache', async () => {
      // Arrange
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(DEFAULT_CONFIG));
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      const updated = await updateConfig(mockEnv, {
        marketCache: {
          newsTtlSec: 1800,
        },
      });

      // Assert
      expect(updated.marketCache?.newsTtlSec).toBe(1800);
      expect(updated.marketCache?.marketDataTtlSec).toBe(300); // Unchanged
      expect(updated.marketCache?.sectorsTtlSec).toBe(2700); // Unchanged
      expect(updated.marketCache?.prefetchCronInterval).toBe('0 * * * *'); // Unchanged
      expect(mockKv.put).toHaveBeenCalled();
    });

    it('should update only prefetchCronInterval in marketCache', async () => {
      // Arrange
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(DEFAULT_CONFIG));
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      const updated = await updateConfig(mockEnv, {
        marketCache: {
          prefetchCronInterval: '0 */2 * * *',
        },
      });

      // Assert
      expect(updated.marketCache?.prefetchCronInterval).toBe('0 */2 * * *');
      expect(updated.marketCache?.newsTtlSec).toBe(3600); // Unchanged
      expect(updated.marketCache?.marketDataTtlSec).toBe(300); // Unchanged
      expect(updated.marketCache?.sectorsTtlSec).toBe(2700); // Unchanged
    });

    it('should update all marketCache fields', async () => {
      // Arrange
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(DEFAULT_CONFIG));
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act
      const updated = await updateConfig(mockEnv, {
        marketCache: {
          marketDataTtlSec: 600,
          sectorsTtlSec: 3600,
          newsTtlSec: 1800,
          prefetchCronInterval: '*/30 * * * *',
        },
      });

      // Assert
      expect(updated.marketCache?.marketDataTtlSec).toBe(600);
      expect(updated.marketCache?.sectorsTtlSec).toBe(3600);
      expect(updated.marketCache?.newsTtlSec).toBe(1800);
      expect(updated.marketCache?.prefetchCronInterval).toBe('*/30 * * * *');
    });

    it('should merge marketCache with existing values', async () => {
      // Arrange
      const existingConfig = {
        ...DEFAULT_CONFIG,
        marketCache: {
          marketDataTtlSec: 600,
          sectorsTtlSec: 3600,
          newsTtlSec: 1800,
          prefetchCronInterval: '0 */2 * * *',
        },
      };
      vi.mocked(mockKv.get).mockResolvedValue(JSON.stringify(existingConfig));
      vi.mocked(mockKv.put).mockResolvedValue(undefined);

      // Act - Only update newsTtlSec
      const updated = await updateConfig(mockEnv, {
        marketCache: {
          newsTtlSec: 7200,
        },
      });

      // Assert
      expect(updated.marketCache?.newsTtlSec).toBe(7200);
      expect(updated.marketCache?.marketDataTtlSec).toBe(600); // Preserved
      expect(updated.marketCache?.sectorsTtlSec).toBe(3600); // Preserved
      expect(updated.marketCache?.prefetchCronInterval).toBe('0 */2 * * *'); // Preserved
    });

    it('should work without KV (fallback mode)', async () => {
      // Arrange
      const envWithoutKv = {
        ...mockEnv,
        alertsKv: undefined,
      } as Env;

      // Act
      const updated = await updateConfig(envWithoutKv, {
        marketCache: {
          newsTtlSec: 1800,
        },
      });

      // Assert
      expect(updated.marketCache?.newsTtlSec).toBe(1800);
      expect(mockKv.put).not.toHaveBeenCalled();
    });
  });
});

