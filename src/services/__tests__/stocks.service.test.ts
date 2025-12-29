/**
 * Stock Service Tests
 * Tests business logic in isolation with mocked repository
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StockService } from '../stocks.service';
import type { IStockRepository } from '../../repositories/interfaces/IStockRepository';
import type { StockDetails } from '@stockly/shared/types';

describe('StockService', () => {
  let service: StockService;
  let mockRepo: IStockRepository;

  beforeEach(() => {
    mockRepo = {
      getStockDetails: vi.fn(),
      watchStockDetails: vi.fn(),
    } as any;

    service = new StockService(mockRepo);
  });

  describe('getStockDetails', () => {
    it('should return stock details for valid symbol', async () => {
      // Arrange
      const symbol = 'AAPL';
      const mockDetails: StockDetails = {
        symbol: 'AAPL',
        profile: {
          companyName: 'Apple Inc.',
          industry: 'Technology',
          sector: 'Consumer Electronics',
          description: 'Test description',
          website: 'https://apple.com',
          image: 'https://example.com/image.png',
        },
        quote: {
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
          dayHigh: 152.0,
          dayLow: 149.0,
          open: 150.5,
          previousClose: 148.5,
          volume: 1000000,
          marketCap: 2500000000000,
        },
        chart: {
          '1D': [],
          '1W': [],
          '1M': [],
          '3M': [],
          '1Y': [],
          'ALL': [],
        },
        financials: {
          income: [],
          keyMetrics: [],
          ratios: [],
        },
        news: [],
        peers: [],
      };

      vi.mocked(mockRepo.getStockDetails).mockResolvedValue(mockDetails);

      // Act
      const result = await service.getStockDetails(symbol);

      // Assert
      expect(result).toEqual(mockDetails);
      expect(mockRepo.getStockDetails).toHaveBeenCalledWith('AAPL');
    });

    it('should normalize symbol to uppercase', async () => {
      // Arrange
      const symbol = 'aapl';
      const mockDetails: StockDetails = {
        symbol: 'AAPL',
        profile: {
          companyName: 'Apple Inc.',
          industry: 'Technology',
          sector: 'Consumer Electronics',
          description: 'Test',
          website: 'https://apple.com',
          image: 'https://example.com/image.png',
        },
        quote: {
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
          dayHigh: 152.0,
          dayLow: 149.0,
          open: 150.5,
          previousClose: 148.5,
          volume: 1000000,
          marketCap: 2500000000000,
        },
        chart: {
          '1D': [],
          '1W': [],
          '1M': [],
          '3M': [],
          '1Y': [],
          'ALL': [],
        },
        financials: {
          income: [],
          keyMetrics: [],
          ratios: [],
        },
        news: [],
        peers: [],
      };

      vi.mocked(mockRepo.getStockDetails).mockResolvedValue(mockDetails);

      // Act
      await service.getStockDetails(symbol);

      // Assert
      expect(mockRepo.getStockDetails).toHaveBeenCalledWith('AAPL');
    });

    it('should throw error for empty symbol', async () => {
      // Arrange
      const symbol = '';

      // Act & Assert
      await expect(service.getStockDetails(symbol)).rejects.toThrow('Invalid symbol format');
      expect(mockRepo.getStockDetails).not.toHaveBeenCalled();
    });

    it('should throw error for symbol longer than 10 characters', async () => {
      // Arrange
      const symbol = 'A'.repeat(11);

      // Act & Assert
      await expect(service.getStockDetails(symbol)).rejects.toThrow('Invalid symbol format');
      expect(mockRepo.getStockDetails).not.toHaveBeenCalled();
    });

    it('should throw error when repository throws', async () => {
      // Arrange
      const symbol = 'AAPL';
      const error = new Error('Repository error');
      vi.mocked(mockRepo.getStockDetails).mockRejectedValue(error);

      // Act & Assert
      await expect(service.getStockDetails(symbol)).rejects.toThrow('Repository error');
    });
  });

  describe('watchStockDetails', () => {
    it('should return async iterable for valid symbol', async () => {
      // Arrange
      const symbol = 'AAPL';
      const mockDetails: StockDetails = {
        symbol: 'AAPL',
        profile: {
          companyName: 'Apple Inc.',
          industry: 'Technology',
          sector: 'Consumer Electronics',
          description: 'Test',
          website: 'https://apple.com',
          image: 'https://example.com/image.png',
        },
        quote: {
          price: 150.0,
          change: 1.5,
          changesPercentage: 1.0,
          dayHigh: 152.0,
          dayLow: 149.0,
          open: 150.5,
          previousClose: 148.5,
          volume: 1000000,
          marketCap: 2500000000000,
        },
        chart: {
          '1D': [],
          '1W': [],
          '1M': [],
          '3M': [],
          '1Y': [],
          'ALL': [],
        },
        financials: {
          income: [],
          keyMetrics: [],
          ratios: [],
        },
        news: [],
        peers: [],
      };

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield mockDetails;
        },
      };

      vi.mocked(mockRepo.watchStockDetails).mockResolvedValue(mockStream);

      // Act
      const result = await service.watchStockDetails(symbol);

      // Assert
      expect(result).toBe(mockStream);
      expect(mockRepo.watchStockDetails).toHaveBeenCalledWith('AAPL');
    });

    it('should normalize symbol to uppercase', async () => {
      // Arrange
      const symbol = 'aapl';
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {} as StockDetails;
        },
      };

      vi.mocked(mockRepo.watchStockDetails).mockResolvedValue(mockStream);

      // Act
      await service.watchStockDetails(symbol);

      // Assert
      expect(mockRepo.watchStockDetails).toHaveBeenCalledWith('AAPL');
    });

    it('should throw error for invalid symbol', async () => {
      // Arrange
      const symbol = '';

      // Act & Assert
      await expect(service.watchStockDetails(symbol)).rejects.toThrow('Invalid symbol format');
      expect(mockRepo.watchStockDetails).not.toHaveBeenCalled();
    });
  });
});

