/**
 * Preferences Repository Interface
 * Defines data access operations for user notification preferences
 */

import type { NotificationPreferences, UpdatePreferencesRequest } from '@stockly/shared/types';

export interface IPreferencesRepository {
  /**
   * Get notification preferences for a user by username
   * @param username Username to get preferences for
   * @returns Notification preferences or null if not found
   */
  getPreferences(username: string): Promise<NotificationPreferences | null>;

  /**
   * Update or create notification preferences for a user
   * @param username Username to update preferences for
   * @param userId User ID (from authentication)
   * @param preferences Preferences to update
   * @returns Updated preferences
   */
  updatePreferences(
    username: string,
    userId: string,
    preferences: UpdatePreferencesRequest
  ): Promise<NotificationPreferences>;
}

