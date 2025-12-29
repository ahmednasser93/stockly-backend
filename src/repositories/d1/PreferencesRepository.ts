/**
 * Preferences Repository Implementation using D1 Database
 * Implements IPreferencesRepository interface
 */

import type { IPreferencesRepository } from '../interfaces/IPreferencesRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { NotificationPreferences, UpdatePreferencesRequest } from '@stockly/shared/types';

type PreferencesRow = {
  user_id: string;
  enabled: number;
  quiet_start: string | null;
  quiet_end: string | null;
  allowed_symbols: string | null;
  max_daily: number | null;
  updated_at: string;
};

const mapRow = (row: PreferencesRow): NotificationPreferences => ({
  userId: row.user_id,
  enabled: Boolean(row.enabled),
  quietStart: row.quiet_start,
  quietEnd: row.quiet_end,
  allowedSymbols: row.allowed_symbols ? row.allowed_symbols.split(',') : null,
  maxDaily: row.max_daily,
  updatedAt: row.updated_at,
});

export class PreferencesRepository implements IPreferencesRepository {
  constructor(private db: IDatabase) {}

  async getPreferences(username: string): Promise<NotificationPreferences | null> {
    const row = await this.db
      .prepare(
        `SELECT user_id, enabled, quiet_start, quiet_end, allowed_symbols, max_daily, updated_at
         FROM user_notification_preferences WHERE username = ?`
      )
      .bind(username)
      .first<PreferencesRow>();

    if (!row) {
      return null;
    }

    return mapRow(row);
  }

  async updatePreferences(
    username: string,
    userId: string,
    preferences: UpdatePreferencesRequest
  ): Promise<NotificationPreferences> {
    const now = new Date().toISOString();
    const symbolsString = preferences.allowedSymbols ? preferences.allowedSymbols.join(',') : null;

    // Check if preferences already exist
    const existing = await this.db
      .prepare(`SELECT user_id FROM user_notification_preferences WHERE username = ?`)
      .bind(username)
      .first();

    if (existing) {
      // Update existing preferences
      await this.db
        .prepare(
          `UPDATE user_notification_preferences
           SET enabled = ?, quiet_start = ?, quiet_end = ?, allowed_symbols = ?, max_daily = ?, updated_at = ?
           WHERE username = ?`
        )
        .bind(
          preferences.enabled ? 1 : 0,
          preferences.quietStart || null,
          preferences.quietEnd || null,
          symbolsString,
          preferences.maxDaily ?? null,
          now,
          username
        )
        .run();
    } else {
      // Insert new preferences
      await this.db
        .prepare(
          `INSERT INTO user_notification_preferences (user_id, username, enabled, quiet_start, quiet_end, allowed_symbols, max_daily, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          userId,
          username,
          preferences.enabled ? 1 : 0,
          preferences.quietStart || null,
          preferences.quietEnd || null,
          symbolsString,
          preferences.maxDaily ?? null,
          now
        )
        .run();
    }

    // Return updated preferences
    const updated = await this.getPreferences(username);
    if (!updated) {
      throw new Error('Failed to retrieve updated preferences');
    }
    return updated;
  }
}

