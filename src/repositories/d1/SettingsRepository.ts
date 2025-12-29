/**
 * Settings Repository Implementation using D1 Database
 * Implements ISettingsRepository interface
 */

import type { ISettingsRepository } from '../interfaces/ISettingsRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { UserSettings, UpdateSettingsRequest } from '@stockly/shared/types';

type SettingsRow = {
  user_id: string;
  username: string | null;
  refresh_interval_minutes: number;
  cache_stale_time_minutes: number | null;
  cache_gc_time_minutes: number | null;
  news_favorite_symbols: string | null;
  updated_at: string;
};

const mapRow = (row: SettingsRow): UserSettings => {
  let newsFavoriteSymbols: string[] | undefined;
  if (row.news_favorite_symbols) {
    try {
      newsFavoriteSymbols = JSON.parse(row.news_favorite_symbols);
    } catch (e) {
      // If parsing fails, set to undefined
      newsFavoriteSymbols = undefined;
    }
  }

  return {
    userId: row.user_id,
    refreshIntervalMinutes: row.refresh_interval_minutes,
    cacheStaleTimeMinutes: row.cache_stale_time_minutes ?? 5,
    cacheGcTimeMinutes: row.cache_gc_time_minutes ?? 10,
    newsFavoriteSymbols,
    updatedAt: row.updated_at,
  };
};

export class SettingsRepository implements ISettingsRepository {
  constructor(private db: IDatabase) {}

  async getSettings(username: string): Promise<UserSettings | null> {
    const row = await this.db
      .prepare(
        `SELECT user_id, username, refresh_interval_minutes, cache_stale_time_minutes, cache_gc_time_minutes, news_favorite_symbols, updated_at
         FROM user_settings WHERE username = ?`
      )
      .bind(username)
      .first<SettingsRow>();

    if (!row) {
      return null;
    }

    return mapRow(row);
  }

  async updateSettings(
    username: string,
    userId: string,
    settings: UpdateSettingsRequest
  ): Promise<UserSettings> {
    const now = new Date().toISOString();

    // Check if settings already exist
    const existing = await this.db
      .prepare(`SELECT user_id FROM user_settings WHERE username = ?`)
      .bind(username)
      .first();

    if (existing) {
      // Update existing settings
      await this.db
        .prepare(
          `UPDATE user_settings
           SET refresh_interval_minutes = ?,
               cache_stale_time_minutes = ?,
               cache_gc_time_minutes = ?,
               updated_at = ?
           WHERE username = ?`
        )
        .bind(
          settings.refreshIntervalMinutes,
          settings.cacheStaleTimeMinutes ?? null,
          settings.cacheGcTimeMinutes ?? null,
          now,
          username
        )
        .run();
    } else {
      // Insert new settings
      await this.db
        .prepare(
          `INSERT INTO user_settings (user_id, username, refresh_interval_minutes, cache_stale_time_minutes, cache_gc_time_minutes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          userId,
          username,
          settings.refreshIntervalMinutes,
          settings.cacheStaleTimeMinutes ?? null,
          settings.cacheGcTimeMinutes ?? null,
          now
        )
        .run();
    }

    // Return updated settings
    const updated = await this.getSettings(username);
    if (!updated) {
      throw new Error('Failed to retrieve updated settings');
    }
    return updated;
  }
}

