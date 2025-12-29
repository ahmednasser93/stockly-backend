/**
 * Alert Repository Interface
 * Defines data access operations for alerts
 */

import type { Alert, CreateAlertRequest, UpdateAlertRequest } from '@stockly/shared/types';

export interface IAlertRepository {
  /**
   * List all alerts for a user (or all alerts if username is null for admin)
   */
  list(username: string | null): Promise<Alert[]>;

  /**
   * List only active alerts
   */
  listActive(username?: string): Promise<Alert[]>;

  /**
   * Get a specific alert by ID
   */
  findById(id: string, username: string | null): Promise<Alert | null>;

  /**
   * Create a new alert
   */
  create(data: CreateAlertRequest, username: string): Promise<Alert>;

  /**
   * Update an existing alert
   */
  update(id: string, data: UpdateAlertRequest, username: string | null): Promise<Alert>;

  /**
   * Delete an alert
   */
  delete(id: string, username: string | null): Promise<void>;
}

