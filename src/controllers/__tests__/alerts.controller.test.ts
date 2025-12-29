/**
 * Alert Controller Tests
 * Tests HTTP request handling with mocked service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertController } from '../alerts.controller';
import type { AlertService } from '../../services/alerts.service';
import type { Logger } from '../../logging/logger';
import type { Env } from '../../index';
import type { Alert, CreateAlertRequest, UpdateAlertRequest } from '@stockly/shared/types';
import * as authMiddleware from '../../auth/middleware';

describe('AlertController', () => {
  let controller: AlertController;
  let mockService: AlertService;
  let mockLogger: Logger;
  let mockEnv: Env;

  beforeEach(() => {
    mockService = {
      listAlerts: vi.fn(),
      getAlert: vi.fn(),
      createAlert: vi.fn(),
      updateAlert: vi.fn(),
      deleteAlert: vi.fn(),
    } as any;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockEnv = {
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    } as Env;

    controller = new AlertController(mockService, mockLogger, mockEnv);
    vi.clearAllMocks();
  });

  describe('listAlerts', () => {
    it('should return list of alerts for authenticated user', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts', {
        method: 'GET',
        headers: {
          'Cookie': 'accessToken=valid-token',
        },
      });
      const mockAlerts: Alert[] = [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          symbol: 'AAPL',
          direction: 'above',
          threshold: 150,
          status: 'active',
          channel: 'notification',
          notes: null,
          username: 'testuser',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      vi.mocked(mockService.listAlerts).mockResolvedValue(mockAlerts);
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.listAlerts(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.alerts).toEqual(mockAlerts);
      expect(mockService.listAlerts).toHaveBeenCalledWith('testuser');
    });

    it('should return empty list when no alerts found', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts');

      vi.mocked(mockService.listAlerts).mockResolvedValue([]);
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.listAlerts(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.alerts).toEqual([]);
    });
  });

  describe('getAlert', () => {
    it('should return alert when found', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts/550e8400-e29b-41d4-a716-446655440000');
      const alertId = '550e8400-e29b-41d4-a716-446655440000';
      const mockAlert: Alert = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
        status: 'active',
        channel: 'notification',
        notes: null,
        username: 'testuser',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockService.getAlert).mockResolvedValue(mockAlert);
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.getAlert(request, alertId);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.alert).toEqual(mockAlert);
      expect(mockService.getAlert).toHaveBeenCalledWith(alertId, 'testuser');
    });

    it('should return 404 when alert not found', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts/not-found');
      const alertId = 'not-found';

      vi.mocked(mockService.getAlert).mockResolvedValue(null);
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.getAlert(request, alertId);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(body.error.code).toBe('ALERT_NOT_FOUND');
      expect(body.error.message).toContain('Alert not found');
    });
  });

  describe('createAlert', () => {
    it('should create alert and return it', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'AAPL',
          direction: 'above',
          threshold: 150,
          channel: 'notification',
        }),
      });
      const mockAlert: Alert = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
        status: 'active',
        channel: 'notification',
        notes: null,
        username: 'testuser',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockService.createAlert).mockResolvedValue(mockAlert);
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.createAlert(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(201);
      expect(body.alert).toEqual(mockAlert);
      expect(mockService.createAlert).toHaveBeenCalled();
    });

    it('should return 400 for invalid request data', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' }),
      });

      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.createAlert(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('updateAlert', () => {
    it('should update alert and return it', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts/550e8400-e29b-41d4-a716-446655440000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 160 }),
      });
      const alertId = '550e8400-e29b-41d4-a716-446655440000';
      const mockAlert: Alert = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        symbol: 'AAPL',
        direction: 'above',
        threshold: 160,
        status: 'active',
        channel: 'notification',
        notes: null,
        username: 'testuser',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      vi.mocked(mockService.updateAlert).mockResolvedValue(mockAlert);
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.updateAlert(request, alertId);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.alert).toEqual(mockAlert);
      expect(mockService.updateAlert).toHaveBeenCalled();
    });

    it('should return 404 when alert not found', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts/not-found', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 160 }),
      });
      const alertId = 'not-found';

      vi.mocked(mockService.updateAlert).mockRejectedValue(new Error('Alert not found'));
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.updateAlert(request, alertId);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(body.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('deleteAlert', () => {
    it('should delete alert and return success', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts/550e8400-e29b-41d4-a716-446655440000', {
        method: 'DELETE',
      });
      const alertId = '550e8400-e29b-41d4-a716-446655440000';

      vi.mocked(mockService.deleteAlert).mockResolvedValue(undefined);
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.deleteAlert(request, alertId);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockService.deleteAlert).toHaveBeenCalledWith(alertId, 'testuser');
    });

    it('should return 404 when alert not found', async () => {
      // Arrange
      const request = new Request('http://localhost/v1/api/alerts/not-found', {
        method: 'DELETE',
      });
      const alertId = 'not-found';

      vi.mocked(mockService.deleteAlert).mockRejectedValue(new Error('Alert not found'));
      vi.spyOn(authMiddleware, 'authenticateRequestWithAdmin').mockResolvedValue({
        username: 'testuser',
        isAdmin: false,
        tokenType: 'access',
      });

      // Act
      const response = await controller.deleteAlert(request, alertId);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(body.error.code).toBe('DELETE_FAILED');
    });
  });
});

