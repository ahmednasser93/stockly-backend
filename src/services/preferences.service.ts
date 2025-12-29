/**
 * Preferences Service
 * Contains business logic for notification preferences operations
 */

import type { IPreferencesRepository } from '../repositories/interfaces/IPreferencesRepository';
import type { NotificationPreferences, UpdatePreferencesRequest } from '@stockly/shared/types';

export class PreferencesService {
  constructor(private preferencesRepo: IPreferencesRepository) {}

  /**
   * Get notification preferences for a user
   * Business logic: Return default preferences if not found
   */
  async getPreferences(username: string, userId: string): Promise<NotificationPreferences> {
    const preferences = await this.preferencesRepo.getPreferences(username);

    if (preferences) {
      return preferences;
    }

    // Return default preferences if not found
    return {
      userId,
      enabled: true,
      quietStart: null,
      quietEnd: null,
      allowedSymbols: null,
      maxDaily: null,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Update notification preferences for a user
   * Business logic: Validate and normalize preferences
   */
  async updatePreferences(
    username: string,
    userId: string,
    preferences: UpdatePreferencesRequest
  ): Promise<NotificationPreferences> {
    // Validation is done by Zod schema in controller
    return this.preferencesRepo.updatePreferences(username, userId, preferences);
  }
}

