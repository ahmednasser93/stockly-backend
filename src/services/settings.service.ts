/**
 * Settings Service
 * Contains business logic for user settings operations
 */

import type { ISettingsRepository } from '../repositories/interfaces/ISettingsRepository';
import type { UserSettings, UpdateSettingsRequest } from '@stockly/shared/types';

export class SettingsService {
  constructor(private settingsRepo: ISettingsRepository) {}

  /**
   * Get user settings
   * Business logic: Return default settings if not found
   */
  async getSettings(username: string, userId: string): Promise<UserSettings> {
    const settings = await this.settingsRepo.getSettings(username);

    if (settings) {
      return settings;
    }

    // Return default settings if not found
    return {
      userId,
      refreshIntervalMinutes: 5,
      cacheStaleTimeMinutes: 5,
      cacheGcTimeMinutes: 10,
      newsFavoriteSymbols: [],
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Update user settings
   * Business logic: Validate and normalize settings
   */
  async updateSettings(
    username: string,
    userId: string,
    settings: UpdateSettingsRequest
  ): Promise<UserSettings> {
    // Validation is done by Zod schema in controller
    return this.settingsRepo.updateSettings(username, userId, settings);
  }
}

