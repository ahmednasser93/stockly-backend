/**
 * Settings Repository Interface
 * Defines data access operations for user settings
 */

import type { UserSettings, UpdateSettingsRequest } from '@stockly/shared/types';

export interface ISettingsRepository {
  /**
   * Get user settings by username
   * @param username Username to get settings for
   * @returns User settings or null if not found
   */
  getSettings(username: string): Promise<UserSettings | null>;

  /**
   * Update or create user settings
   * @param username Username to update settings for
   * @param userId User ID (from authentication)
   * @param settings Settings to update
   * @returns Updated settings
   */
  updateSettings(
    username: string,
    userId: string,
    settings: UpdateSettingsRequest
  ): Promise<UserSettings>;
}

