/**
 * Alert Service
 * Contains business logic for alert operations
 */

import type { IAlertRepository } from '../repositories/interfaces/IAlertRepository';
import type { Alert, CreateAlertRequest, UpdateAlertRequest } from '@stockly/shared/types';

export class AlertService {
  constructor(private alertRepo: IAlertRepository) {}

  /**
   * List alerts for a user (or all alerts for admin)
   */
  async listAlerts(username: string | null): Promise<Alert[]> {
    return this.alertRepo.list(username);
  }

  /**
   * List only active alerts
   */
  async listActiveAlerts(username?: string): Promise<Alert[]> {
    return this.alertRepo.listActive(username);
  }

  /**
   * Get a specific alert by ID
   */
  async getAlert(id: string, username: string | null): Promise<Alert | null> {
    return this.alertRepo.findById(id, username);
  }

  /**
   * Create a new alert
   * Business logic: Validate username is provided
   */
  async createAlert(data: CreateAlertRequest, username: string): Promise<Alert> {
    if (!username || username.trim().length === 0) {
      throw new Error('Username is required to create alerts');
    }

    // Additional business logic can be added here
    // e.g., check for duplicate alerts, validate symbol exists, etc.

    return this.alertRepo.create(data, username);
  }

  /**
   * Update an existing alert
   */
  async updateAlert(id: string, data: UpdateAlertRequest, username: string | null): Promise<Alert> {
    // Verify alert exists and user has permission
    const existing = await this.alertRepo.findById(id, username);
    if (!existing) {
      throw new Error('Alert not found');
    }

    return this.alertRepo.update(id, data, username);
  }

  /**
   * Delete an alert
   */
  async deleteAlert(id: string, username: string | null): Promise<void> {
    // Verify alert exists and user has permission
    const existing = await this.alertRepo.findById(id, username);
    if (!existing) {
      throw new Error('Alert not found');
    }

    return this.alertRepo.delete(id, username);
  }
}

