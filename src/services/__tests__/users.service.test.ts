/**
 * UserService Unit Tests
 * Tests business logic in isolation with mocked repository
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../users.service';
import type { IUserRepository } from '../../repositories/interfaces/IUserRepository';
import type { User, UpdateUserProfileRequest } from '@stockly/shared/types';

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepo: IUserRepository;

  beforeEach(() => {
    mockUserRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      findByUsername: vi.fn(),
    } as unknown as IUserRepository;

    userService = new UserService(mockUserRepo);
  });

  describe('updateProfile', () => {
    it('should successfully update profile when username is available', async () => {
      // Arrange
      const userId = 'user-123';
      const updateData: UpdateUserProfileRequest = {
        username: 'newusername',
        name: 'New Name',
      };
      const existingUser: User = {
        id: userId,
        email: 'test@example.com',
        username: 'oldusername',
        name: 'Old Name',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const updatedUser: User = {
        ...existingUser,
        username: 'newusername',
        name: 'New Name',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(null);
      vi.mocked(mockUserRepo.update).mockResolvedValue(updatedUser);

      // Act
      const result = await userService.updateProfile(userId, updateData);

      // Assert
      expect(result).toEqual(updatedUser);
      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith('newusername');
      expect(mockUserRepo.update).toHaveBeenCalledWith(userId, updateData);
    });

    it('should throw error when username is already taken by another user', async () => {
      // Arrange
      const userId = 'user-123';
      const updateData: UpdateUserProfileRequest = { username: 'takenusername' };
      const existingUserWithUsername: User = {
        id: 'other-user-456',
        email: 'other@example.com',
        username: 'takenusername',
        name: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(existingUserWithUsername);

      // Act & Assert
      await expect(userService.updateProfile(userId, updateData)).rejects.toThrow('Username already taken');
      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith('takenusername');
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('should allow updating username to same username (no-op)', async () => {
      // Arrange
      const userId = 'user-123';
      const updateData: UpdateUserProfileRequest = { username: 'currentusername' };
      const currentUser: User = {
        id: userId,
        email: 'test@example.com',
        username: 'currentusername',
        name: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const updatedUser: User = {
        ...currentUser,
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(currentUser);
      vi.mocked(mockUserRepo.update).mockResolvedValue(updatedUser);

      // Act
      const result = await userService.updateProfile(userId, updateData);

      // Assert
      expect(result).toEqual(updatedUser);
      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith('currentusername');
      expect(mockUserRepo.update).toHaveBeenCalledWith(userId, updateData);
    });

    it('should update name without username validation', async () => {
      // Arrange
      const userId = 'user-123';
      const updateData: UpdateUserProfileRequest = { name: 'New Name' };
      const updatedUser: User = {
        id: userId,
        email: 'test@example.com',
        username: 'currentusername',
        name: 'New Name',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      vi.mocked(mockUserRepo.update).mockResolvedValue(updatedUser);

      // Act
      const result = await userService.updateProfile(userId, updateData);

      // Assert
      expect(result).toEqual(updatedUser);
      expect(mockUserRepo.findByUsername).not.toHaveBeenCalled();
      expect(mockUserRepo.update).toHaveBeenCalledWith(userId, updateData);
    });
  });

  describe('getProfile', () => {
    it('should return user profile by ID', async () => {
      // Arrange
      const userId = 'user-123';
      const user: User = {
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockUserRepo.findById).mockResolvedValue(user);

      // Act
      const result = await userService.getProfile(userId);

      // Assert
      expect(result).toEqual(user);
      expect(mockUserRepo.findById).toHaveBeenCalledWith(userId);
    });

    it('should return null when user not found', async () => {
      // Arrange
      const userId = 'non-existent';
      vi.mocked(mockUserRepo.findById).mockResolvedValue(null);

      // Act
      const result = await userService.getProfile(userId);

      // Assert
      expect(result).toBeNull();
      expect(mockUserRepo.findById).toHaveBeenCalledWith(userId);
    });
  });

  describe('getProfileByUsername', () => {
    it('should return user profile by username', async () => {
      // Arrange
      const username = 'testuser';
      const user: User = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(user);

      // Act
      const result = await userService.getProfileByUsername(username);

      // Assert
      expect(result).toEqual(user);
      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith(username);
    });
  });
});

