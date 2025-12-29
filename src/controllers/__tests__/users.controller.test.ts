/**
 * UserController Tests
 * Tests HTTP request handling and validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserController } from '../users.controller';
import { UserService } from '../../services/users.service';
import type { Logger } from '../../logging/logger';
import type { Env } from '../../index';
import type { User } from '@stockly/shared/types';
import * as authMiddleware from '../../auth/middleware';

describe('UserController', () => {
  let controller: UserController;
  let mockUserService: UserService;
  let mockLogger: Logger;
  let mockEnv: Env;

  beforeEach(() => {
    mockUserService = {
      getProfile: vi.fn(),
      getProfileByUsername: vi.fn(),
      updateProfile: vi.fn(),
    } as unknown as UserService;

    mockLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      logDataOperation: vi.fn(),
      logApiCall: vi.fn(),
      getLogs: vi.fn(() => []),
      clearLogs: vi.fn(),
    } as unknown as Logger;

    mockEnv = {
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    } as unknown as Env;

    controller = new UserController(mockUserService, mockLogger, mockEnv);
  });

  describe('getProfile', () => {
    it('should return user profile when authenticated', async () => {
      // Arrange
      const user: User = {
        id: 'user-123',
        email: 'user@example.com',
        username: 'testuser',
        name: 'Test User',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockUserService.getProfileByUsername).mockResolvedValue(user);
      vi.spyOn(authMiddleware, 'authenticateRequest').mockResolvedValue({
        username: 'testuser',
        tokenType: 'access',
      });

      const request = new Request('http://localhost/v1/api/users/profile', {
        method: 'GET',
        headers: {
          'Cookie': 'accessToken=valid-token',
        },
      });

      // Act
      const response = await controller.getProfile(request);

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user).toEqual(user);
      expect(mockUserService.getProfileByUsername).toHaveBeenCalledWith('testuser');
    });

    it('should return 401 when not authenticated', async () => {
      // Arrange
      vi.spyOn(authMiddleware, 'authenticateRequest').mockResolvedValue(null);

      const request = new Request('http://localhost/v1/api/users/profile', {
        method: 'GET',
      });

      // Act
      const response = await controller.getProfile(request);

      // Assert
      expect(response.status).toBe(401);
      const data = await response.json();
      // Error response format may vary, check for error field
      expect(data.error || data.message).toBeDefined();
    });
  });

  describe('updateProfile', () => {
    it('should update profile with valid data', async () => {
      // Arrange
      const updatedUser: User = {
        id: 'user-123',
        email: 'user@example.com',
        username: 'newusername',
        name: 'New Name',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      const currentUser: User = {
        ...updatedUser,
        username: 'oldusername',
        name: 'Old Name',
      };

      vi.mocked(mockUserService.getProfileByUsername).mockResolvedValue(currentUser);
      vi.mocked(mockUserService.updateProfile).mockResolvedValue(updatedUser);
      vi.spyOn(authMiddleware, 'authenticateRequest').mockResolvedValue({
        username: 'oldusername',
        tokenType: 'access',
      });

      const request = new Request('http://localhost/v1/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'accessToken=valid-token',
        },
        body: JSON.stringify({
          username: 'newusername',
          name: 'New Name',
        }),
      });

      // Act
      const response = await controller.updateProfile(request);

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user).toEqual(updatedUser);
      expect(mockUserService.updateProfile).toHaveBeenCalledWith('user-123', {
        username: 'newusername',
        name: 'New Name',
      });
    });

    it('should return 400 for invalid request data', async () => {
      // Arrange
      const { authenticateRequest } = await import('../../auth/middleware');
      vi.mocked(authenticateRequest).mockResolvedValue({
        username: 'testuser',
        tokenType: 'access',
        userId: 'user-123',
      } as any);

      const request = new Request('http://localhost/v1/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'accessToken=valid-token',
        },
        body: JSON.stringify({
          username: 'ab', // Too short - invalid
        }),
      });

      // Act
      const response = await controller.updateProfile(request);

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should return 409 when username is already taken', async () => {
      // Arrange
      const currentUser: User = {
        id: 'user-123',
        email: 'user@example.com',
        username: 'oldusername',
        name: 'Old Name',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockUserService.getProfileByUsername).mockResolvedValue(currentUser);
      vi.mocked(mockUserService.updateProfile).mockRejectedValue(new Error('Username already taken'));

      vi.spyOn(authMiddleware, 'authenticateRequest').mockResolvedValue({
        username: 'oldusername',
        tokenType: 'access',
      });

      const request = new Request('http://localhost/v1/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'accessToken=valid-token',
        },
        body: JSON.stringify({
          username: 'takenusername',
        }),
      });

      // Act
      const response = await controller.updateProfile(request);

      // Assert
      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('Username already taken');
    });
  });
});

