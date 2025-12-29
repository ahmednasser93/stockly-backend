/**
 * UserRepository Tests
 * Tests repository implementation with mocked database
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRepository } from '../../d1/UserRepository';
import type { IDatabase } from '../../../infrastructure/database/IDatabase';
import type { User, UpdateUserProfileRequest } from '@stockly/shared/types';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockDb: IDatabase;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn(),
    } as unknown as IDatabase;

    repository = new UserRepository(mockDb);
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = 'user-123';
      const dbResult = {
        id: userId,
        email: 'user@example.com',
        username: 'testuser',
        name: 'Test User',
        created_at: 1704067200, // Unix timestamp
        updated_at: 1704067200,
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(dbResult),
      };

      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt as any);

      // Act
      const result = await repository.findById(userId);

      // Assert
      expect(result).toEqual({
        id: userId,
        email: 'user@example.com',
        username: 'testuser',
        name: 'Test User',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT id, email, username, name, created_at, updated_at FROM users WHERE id = ?'
      );
      expect(mockStmt.bind).toHaveBeenCalledWith(userId);
    });

    it('should return null when user not found', async () => {
      // Arrange
      const userId = 'non-existent';
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt as any);

      // Act
      const result = await repository.findById(userId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should return user when found by username', async () => {
      // Arrange
      const username = 'testuser';
      const dbResult = {
        id: 'user-123',
        email: 'user@example.com',
        username: 'testuser',
        name: 'Test User',
        created_at: 1704067200,
        updated_at: 1704067200,
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(dbResult),
      };

      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt as any);

      // Act
      const result = await repository.findByUsername(username);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.username).toBe('testuser');
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(username) = LOWER(?)')
      );
    });
  });

  describe('update', () => {
    it('should update user profile', async () => {
      // Arrange
      const userId = 'user-123';
      const updateData: UpdateUserProfileRequest = {
        username: 'newusername',
        name: 'New Name',
      };

      const mockUpdateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1, last_row_id: 0 } }),
      };

      // Mock for findById call after update
      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: userId,
          email: 'user@example.com',
          username: 'newusername',
          name: 'New Name',
          created_at: 1704067200,
          updated_at: 1704153600,
        }),
      };

      vi.mocked(mockDb.prepare).mockImplementation((query: string) => {
        if (query.includes('UPDATE')) {
          return mockUpdateStmt as any;
        }
        // For SELECT queries (findById)
        return mockSelectStmt as any;
      });

      // Act
      const result = await repository.update(userId, updateData);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.username).toBe('newusername');
      expect(result?.name).toBe('New Name');
      expect(mockUpdateStmt.run).toHaveBeenCalled();
      expect(mockSelectStmt.first).toHaveBeenCalled();
    });

    it('should handle partial updates', async () => {
      // Arrange
      const userId = 'user-123';
      const updateData: UpdateUserProfileRequest = {
        name: 'New Name Only',
      };

      const mockUpdateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1, last_row_id: 0 } }),
      };

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: userId,
          email: 'user@example.com',
          username: 'testuser',
          name: 'New Name Only',
          created_at: 1704067200,
          updated_at: 1704153600,
        }),
      };

      vi.mocked(mockDb.prepare).mockImplementation((query: string) => {
        if (query.includes('UPDATE')) {
          return mockUpdateStmt as any;
        }
        return mockSelectStmt as any;
      });

      // Act
      const result = await repository.update(userId, updateData);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toBe('New Name Only');
      expect(result?.username).toBe('testuser'); // Unchanged
    });
  });
});

