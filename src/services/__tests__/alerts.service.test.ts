/**
 * AlertService Tests
 * Tests business logic in isolation with mocked repository
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertService } from '../alerts.service';
import type { IAlertRepository } from '../../repositories/interfaces/IAlertRepository';
import type { Alert, CreateAlertRequest, UpdateAlertRequest } from '@stockly/shared/types';

describe('AlertService', () => {
  let alertService: AlertService;
  let mockAlertRepo: IAlertRepository;

  beforeEach(() => {
    mockAlertRepo = {
      list: vi.fn(),
      listActive: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as IAlertRepository;

    alertService = new AlertService(mockAlertRepo);
  });

  describe('listAlerts', () => {
    it('should return list of alerts from repository', async () => {
      // Arrange
      const alerts: Alert[] = [
        {
          id: 'alert-1',
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

      vi.mocked(mockAlertRepo.list).mockResolvedValue(alerts);

      // Act
      const result = await alertService.listAlerts('testuser');

      // Assert
      expect(result).toEqual(alerts);
      expect(mockAlertRepo.list).toHaveBeenCalledWith('testuser');
    });

    it('should support admin access with null username', async () => {
      // Arrange
      const alerts: Alert[] = [];
      vi.mocked(mockAlertRepo.list).mockResolvedValue(alerts);

      // Act
      const result = await alertService.listAlerts(null);

      // Assert
      expect(result).toEqual(alerts);
      expect(mockAlertRepo.list).toHaveBeenCalledWith(null);
    });
  });

  describe('listActiveAlerts', () => {
    it('should return only active alerts', async () => {
      // Arrange
      const activeAlerts: Alert[] = [
        {
          id: 'alert-1',
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

      vi.mocked(mockAlertRepo.listActive).mockResolvedValue(activeAlerts);

      // Act
      const result = await alertService.listActiveAlerts('testuser');

      // Assert
      expect(result).toEqual(activeAlerts);
      expect(mockAlertRepo.listActive).toHaveBeenCalledWith('testuser');
    });
  });

  describe('getAlert', () => {
    it('should return alert when found', async () => {
      // Arrange
      const alert: Alert = {
        id: 'alert-1',
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

      vi.mocked(mockAlertRepo.findById).mockResolvedValue(alert);

      // Act
      const result = await alertService.getAlert('alert-1', 'testuser');

      // Assert
      expect(result).toEqual(alert);
      expect(mockAlertRepo.findById).toHaveBeenCalledWith('alert-1', 'testuser');
    });

    it('should return null when alert not found', async () => {
      // Arrange
      vi.mocked(mockAlertRepo.findById).mockResolvedValue(null);

      // Act
      const result = await alertService.getAlert('non-existent', 'testuser');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('createAlert', () => {
    it('should create alert with valid data', async () => {
      // Arrange
      const createData: CreateAlertRequest = {
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
        channel: 'notification',
        notes: 'Test alert',
      };

      const createdAlert: Alert = {
        id: 'alert-1',
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
        status: 'active',
        channel: 'notification',
        notes: 'Test alert',
        username: 'testuser',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockAlertRepo.create).mockResolvedValue(createdAlert);

      // Act
      const result = await alertService.createAlert(createData, 'testuser');

      // Assert
      expect(result).toEqual(createdAlert);
      expect(mockAlertRepo.create).toHaveBeenCalledWith(createData, 'testuser');
    });

    it('should throw error when username is empty', async () => {
      // Arrange
      const createData: CreateAlertRequest = {
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
      };

      // Act & Assert
      await expect(alertService.createAlert(createData, '')).rejects.toThrow('Username is required');
      expect(mockAlertRepo.create).not.toHaveBeenCalled();
    });

    it('should throw error when username is null', async () => {
      // Arrange
      const createData: CreateAlertRequest = {
        symbol: 'AAPL',
        direction: 'above',
        threshold: 150,
      };

      // Act & Assert
      await expect(alertService.createAlert(createData, null as any)).rejects.toThrow('Username is required');
      expect(mockAlertRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateAlert', () => {
    it('should update alert when found', async () => {
      // Arrange
      const existingAlert: Alert = {
        id: 'alert-1',
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

      const updateData: UpdateAlertRequest = {
        threshold: 160,
        status: 'paused',
      };

      const updatedAlert: Alert = {
        ...existingAlert,
        threshold: 160,
        status: 'paused',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      vi.mocked(mockAlertRepo.findById).mockResolvedValue(existingAlert);
      vi.mocked(mockAlertRepo.update).mockResolvedValue(updatedAlert);

      // Act
      const result = await alertService.updateAlert('alert-1', updateData, 'testuser');

      // Assert
      expect(result).toEqual(updatedAlert);
      expect(mockAlertRepo.findById).toHaveBeenCalledWith('alert-1', 'testuser');
      expect(mockAlertRepo.update).toHaveBeenCalledWith('alert-1', updateData, 'testuser');
    });

    it('should throw error when alert not found', async () => {
      // Arrange
      const updateData: UpdateAlertRequest = {
        threshold: 160,
      };

      vi.mocked(mockAlertRepo.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(alertService.updateAlert('non-existent', updateData, 'testuser')).rejects.toThrow('Alert not found');
      expect(mockAlertRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteAlert', () => {
    it('should delete alert when found', async () => {
      // Arrange
      const existingAlert: Alert = {
        id: 'alert-1',
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

      vi.mocked(mockAlertRepo.findById).mockResolvedValue(existingAlert);
      vi.mocked(mockAlertRepo.delete).mockResolvedValue(undefined);

      // Act
      await alertService.deleteAlert('alert-1', 'testuser');

      // Assert
      expect(mockAlertRepo.findById).toHaveBeenCalledWith('alert-1', 'testuser');
      expect(mockAlertRepo.delete).toHaveBeenCalledWith('alert-1', 'testuser');
    });

    it('should throw error when alert not found', async () => {
      // Arrange
      vi.mocked(mockAlertRepo.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(alertService.deleteAlert('non-existent', 'testuser')).rejects.toThrow('Alert not found');
      expect(mockAlertRepo.delete).not.toHaveBeenCalled();
    });
  });
});

