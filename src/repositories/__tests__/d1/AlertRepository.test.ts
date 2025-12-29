/**
 * AlertRepository Tests
 * Tests repository implementation with mocked database
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertRepository } from '../../d1/AlertRepository';
import type { IDatabase } from '../../../infrastructure/database/IDatabase';
import type { Alert, CreateAlertRequest, UpdateAlertRequest } from '@stockly/shared/types';

describe('AlertRepository', () => {
  let repository: AlertRepository;
  let mockDb: IDatabase;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn(),
    } as unknown as IDatabase;

    repository = new AlertRepository(mockDb);
  });

  describe('list', () => {
    it('should return all alerts for admin (username null)', async () => {
      // Arrange
      const dbResults = [
        {
          id: 'alert-1',
          symbol: 'AAPL',
          direction: 'above',
          threshold: 150,
          status: 'active',
          channel: 'notification',
          notes: null,
          username: 'user1',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: dbResults }),
      };

      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt as any);

      // Act
      const result = await repository.list(null);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('alert-1');
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, symbol')
      );
    });

    it('should return alerts filtered by username', async () => {
      // Arrange
      const dbResults = [
        {
          id: 'alert-1',
          symbol: 'AAPL',
          direction: 'above',
          threshold: 150,
          status: 'active',
          channel: 'notification',
          notes: null,
          username: 'testuser',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: dbResults }),
      };

      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt as any);

      // Act
      const result = await repository.list('testuser');

      // Assert
      expect(result).toHaveLength(1);
      expect(mockStmt.bind).toHaveBeenCalledWith('testuser');
    });
  });

  describe('create', () => {
    it('should create alert and return it', async () => {
      // Arrange
      const createData: CreateAlertRequest = {
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
        channel: 'notification',
      };

      const mockInsertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: 'alert-1',
          symbol: 'AAPL',
          direction: 'above',
          threshold: 150,
          status: 'active',
          channel: 'notification',
          notes: null,
          username: 'testuser',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        }),
      };

      vi.mocked(mockDb.prepare).mockImplementation((query: string) => {
        if (query.includes('INSERT')) {
          return mockInsertStmt as any;
        }
        return mockSelectStmt as any;
      });

      // Act
      const result = await repository.create(createData, 'testuser');

      // Assert
      expect(result).toBeDefined();
      expect(result.symbol).toBe('AAPL');
      expect(result.username).toBe('testuser');
      expect(mockInsertStmt.run).toHaveBeenCalled();
    });

    it('should throw error when username is empty', async () => {
      // Arrange
      const createData: CreateAlertRequest = {
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
      };

      // Act & Assert
      await expect(repository.create(createData, '')).rejects.toThrow('username is required');
    });
  });

  describe('update', () => {
    it('should update alert and return updated version', async () => {
      // Arrange
      const updateData: UpdateAlertRequest = {
        threshold: 160,
        status: 'paused',
      };

      const existingAlert = {
        id: 'alert-1',
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
        status: 'active',
        channel: 'notification',
        notes: null,
        username: 'testuser',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const updatedAlert = {
        id: 'alert-1',
        symbol: 'AAPL',
        direction: 'above',
        threshold: 160,
        status: 'paused',
        channel: 'notification',
        notes: null,
        username: 'testuser',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      const mockUpdateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      // findById is called once after the update to return the updated alert
      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(updatedAlert),
      };

      vi.mocked(mockDb.prepare).mockImplementation((query: string) => {
        if (query.includes('UPDATE')) {
          return mockUpdateStmt as any;
        }
        // SELECT query (findById after update)
        return mockSelectStmt as any;
      });

      // Act
      const result = await repository.update('alert-1', updateData, 'testuser');

      // Assert
      expect(result.threshold).toBe(160);
      expect(result.status).toBe('paused');
      expect(mockSelectStmt.first).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('should delete alert for user', async () => {
      // Arrange
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt as any);

      // Act
      await repository.delete('alert-1', 'testuser');

      // Assert
      expect(mockStmt.bind).toHaveBeenCalledWith('alert-1', 'testuser');
      expect(mockStmt.run).toHaveBeenCalled();
    });

    it('should delete alert for admin (username null)', async () => {
      // Arrange
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt as any);

      // Act
      await repository.delete('alert-1', null);

      // Assert
      expect(mockStmt.bind).toHaveBeenCalledWith('alert-1');
      expect(mockStmt.run).toHaveBeenCalled();
    });
  });
});

