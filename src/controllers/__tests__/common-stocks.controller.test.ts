/**
 * Common Stocks Controller Tests
 * Tests controller endpoint logic and response validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommonStocksController } from '../common-stocks.controller';
import type { CommonStocksService } from '../../services/common-stocks.service';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import {
  CommonStocksResponseSchema,
  AddCommonStockRequestSchema,
  UpdateCommonStockRequestSchema,
  BulkAddCommonStocksResponseSchema,
} from '@stockly/shared/schemas';
import type { CommonStock } from '@stockly/shared/types';

// Mock the authenticateRequestWithAdmin function
vi.mock('../../auth/middleware', () => ({
  authenticateRequestWithAdmin: vi.fn(),
}));

import { authenticateRequestWithAdmin } from '../../auth/middleware';

// Helper to add Origin header for client authentication in tests
const createTestRequest = (url: string, init?: RequestInit): Request => {
  return new Request(url, {
    ...init,
    headers: {
      "Origin": "http://localhost:5173",
      ...init?.headers,
    }
  });
};

describe('CommonStocksController', () => {
  let controller: CommonStocksController;
  let mockService: CommonStocksService;
  let mockEnv: Env;
  let mockLogger: Logger;

  beforeEach(() => {
    mockEnv = {
      stockly: {} as any,
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    } as Env;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockService = {
      getAllActiveStocks: vi.fn(),
      getAllStocks: vi.fn(),
      getStockBySymbol: vi.fn(),
      addStock: vi.fn(),
      updateStock: vi.fn(),
      deleteStock: vi.fn(),
      removeStock: vi.fn(), // Alias used by controller
      bulkAddStocks: vi.fn(),
      getStocksCount: vi.fn(),
    } as any;

    controller = new CommonStocksController(mockService, mockLogger, mockEnv);
    vi.clearAllMocks();

    // Default mock: authenticated admin user
    vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
      userId: 'user-123',
      username: 'admin',
      isAdmin: true,
    } as any);
  });

  describe('getCommonStocks', () => {
    it('should return common stocks list successfully (active only)', async () => {
      // Arrange
      const mockStocks: CommonStock[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          exchange: 'NASDAQ',
          addedAt: Date.now(),
          isActive: true,
        },
        {
          symbol: 'MSFT',
          name: 'Microsoft Corporation',
          exchange: 'NASDAQ',
          addedAt: Date.now(),
          isActive: true,
        },
      ];

      vi.mocked(mockService.getAllActiveStocks).mockResolvedValue(mockStocks);
      vi.mocked(mockService.getStocksCount).mockResolvedValue(2);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks?activeOnly=true');

      // Act
      const response = await controller.getCommonStocks(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('stocks');
      expect(json).toHaveProperty('total');
      expect(json.stocks).toHaveLength(2);
      expect(json.total).toBe(2);
      expect(CommonStocksResponseSchema.safeParse(json).success).toBe(true);
      expect(mockService.getAllActiveStocks).toHaveBeenCalledTimes(1);
    });

    it('should return all stocks (including inactive) when activeOnly=false', async () => {
      // Arrange
      const mockStocks: CommonStock[] = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          exchange: 'NASDAQ',
          addedAt: Date.now(),
          isActive: true,
        },
        {
          symbol: 'OLD',
          name: 'Old Stock',
          exchange: 'NYSE',
          addedAt: Date.now(),
          isActive: false,
        },
      ];

      vi.mocked(mockService.getAllStocks).mockResolvedValue(mockStocks);
      vi.mocked(mockService.getStocksCount).mockResolvedValue(2);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks?activeOnly=false');

      // Act
      const response = await controller.getCommonStocks(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.stocks).toHaveLength(2);
      expect(mockService.getAllStocks).toHaveBeenCalledTimes(1);
      expect(mockService.getAllActiveStocks).not.toHaveBeenCalled();
    });

    it('should return 401 when not authenticated as admin', async () => {
      // Arrange
      vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
        userId: 'user-123',
        username: 'user',
        isAdmin: false,
      } as any);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks');

      // Act
      const response = await controller.getCommonStocks(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(json.error).toBeDefined();
      expect(mockService.getAllActiveStocks).not.toHaveBeenCalled();
    });

    it('should return 500 when service throws error', async () => {
      // Arrange
      vi.mocked(mockService.getAllActiveStocks).mockRejectedValue(new Error('Service error'));
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks');

      // Act
      const response = await controller.getCommonStocks(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('addCommonStock', () => {
    it('should add a new stock successfully', async () => {
      // Arrange
      const mockStock: CommonStock = {
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        exchange: 'NASDAQ',
        addedAt: Date.now(),
        isActive: true,
      };

      vi.mocked(mockService.addStock).mockResolvedValue(mockStock);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks', {
        method: 'POST',
        body: JSON.stringify({
          symbol: 'TSLA',
          name: 'Tesla Inc.',
          exchange: 'NASDAQ',
        }),
      });

      // Act
      const response = await controller.addCommonStock(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('stock');
      expect(json.stock.symbol).toBe('TSLA');
      expect(AddCommonStockRequestSchema.safeParse({ symbol: 'TSLA' }).success).toBe(true);
      expect(mockService.addStock).toHaveBeenCalledTimes(1);
    });

    it('should return 400 for invalid request body', async () => {
      // Arrange
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks', {
        method: 'POST',
        body: JSON.stringify({}), // Missing required symbol
      });

      // Act
      const response = await controller.addCommonStock(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json.error).toBeDefined();
      expect(mockService.addStock).not.toHaveBeenCalled();
    });

    it('should return 401 when not authenticated as admin', async () => {
      // Arrange
      vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
        userId: 'user-123',
        username: 'user',
        isAdmin: false,
      } as any);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks', {
        method: 'POST',
        body: JSON.stringify({ symbol: 'TSLA' }),
      });

      // Act
      const response = await controller.addCommonStock(request);

      // Assert
      expect(response.status).toBe(401);
      expect(mockService.addStock).not.toHaveBeenCalled();
    });
  });

  describe('updateCommonStock', () => {
    it('should update a stock successfully', async () => {
      // Arrange
      const mockStock: CommonStock = {
        symbol: 'AAPL',
        name: 'Apple Inc. Updated',
        exchange: 'NASDAQ',
        addedAt: Date.now(),
        isActive: true,
      };

      vi.mocked(mockService.updateStock).mockResolvedValue(mockStock);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks/AAPL', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Apple Inc. Updated',
        }),
      });

      // Act
      const response = await controller.updateCommonStock(request, 'AAPL');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('stock');
      expect(json.stock.name).toBe('Apple Inc. Updated');
      expect(mockService.updateStock).toHaveBeenCalledWith('AAPL', expect.any(Object));
    });

    it('should return 404 when stock not found', async () => {
      // Arrange
      vi.mocked(mockService.updateStock).mockRejectedValue(new Error('Stock with symbol NONEXISTENT not found'));
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks/NONEXISTENT', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      // Act
      const response = await controller.updateCommonStock(request, 'NONEXISTENT');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(json.error).toBeDefined();
    });
  });

  describe('deleteCommonStock', () => {
    it('should delete (deactivate) a stock successfully', async () => {
      // Arrange
      vi.mocked(mockService.removeStock).mockResolvedValue(true);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks/AAPL', {
        method: 'DELETE',
      });

      // Act
      const response = await controller.deleteCommonStock(request, 'AAPL');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('success');
      expect(json.success).toBe(true);
      expect(mockService.removeStock).toHaveBeenCalledWith('AAPL');
    });

    it('should return 404 when stock not found', async () => {
      // Arrange
      vi.mocked(mockService.removeStock).mockRejectedValue(new Error('Stock with symbol NONEXISTENT not found'));
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks/NONEXISTENT', {
        method: 'DELETE',
      });

      // Act
      const response = await controller.deleteCommonStock(request, 'NONEXISTENT');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(json.error).toBeDefined();
    });
  });

  describe('bulkAddCommonStocks', () => {
    it('should bulk add stocks successfully', async () => {
      // Arrange
      const mockResult = {
        added: 2,
        skipped: 0,
        errors: [] as string[],
      };

      vi.mocked(mockService.bulkAddStocks).mockResolvedValue(mockResult);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks/bulk', {
        method: 'POST',
        body: JSON.stringify({
          stocks: [
            { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ' },
            { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ' },
          ],
        }),
      });

      // Act
      const response = await controller.bulkAddCommonStocks(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('added');
      expect(json).toHaveProperty('skipped');
      expect(json).toHaveProperty('errors');
      expect(json.added).toBe(2);
      expect(BulkAddCommonStocksResponseSchema.safeParse(json).success).toBe(true);
      expect(mockService.bulkAddStocks).toHaveBeenCalledTimes(1);
    });

    it('should handle partial success with errors', async () => {
      // Arrange
      const mockResult = {
        added: 1,
        skipped: 1,
        errors: ['Duplicate symbol: TSLA'],
      };

      vi.mocked(mockService.bulkAddStocks).mockResolvedValue(mockResult);
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks/bulk', {
        method: 'POST',
        body: JSON.stringify({
          stocks: [
            { symbol: 'TSLA', name: 'Tesla Inc.' },
            { symbol: 'TSLA', name: 'Tesla Inc. Duplicate' }, // Duplicate
          ],
        }),
      });

      // Act
      const response = await controller.bulkAddCommonStocks(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.added).toBe(1);
      expect(json.skipped).toBe(1);
      expect(json.errors).toHaveLength(1);
    });

    it('should return 400 for invalid request body', async () => {
      // Arrange
      const request = createTestRequest('https://example.com/v1/api/admin/common-stocks/bulk', {
        method: 'POST',
        body: JSON.stringify({ stocks: 'invalid' }), // Should be array
      });

      // Act
      const response = await controller.bulkAddCommonStocks(request);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(json.error).toBeDefined();
      expect(mockService.bulkAddStocks).not.toHaveBeenCalled();
    });
  });
});

