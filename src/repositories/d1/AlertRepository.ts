/**
 * Alert Repository Implementation using D1 Database
 * Implements IAlertRepository interface using IDatabase abstraction
 */

import type { IAlertRepository } from '../interfaces/IAlertRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { Alert, CreateAlertRequest, UpdateAlertRequest } from '@stockly/shared/types';

type AlertRow = {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  threshold: number;
  status: 'active' | 'paused';
  channel: 'notification';
  notes: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_BASE = `SELECT id, symbol, direction, threshold, status, channel, notes, username, created_at, updated_at FROM alerts`;

const mapRow = (row: AlertRow): Alert => ({
  id: row.id,
  symbol: row.symbol,
  direction: row.direction,
  threshold: row.threshold,
  status: row.status,
  channel: row.channel,
  notes: row.notes,
  username: row.username,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class AlertRepository implements IAlertRepository {
  constructor(private db: IDatabase) {}

  async list(username: string | null): Promise<Alert[]> {
    if (username === null) {
      // Admin: get all alerts
      const result = await this.db
        .prepare(`${SELECT_BASE} ORDER BY created_at DESC`)
        .all<AlertRow>();
      return (result.results ?? []).map(mapRow);
    }
    // Filter alerts by username
    const result = await this.db
      .prepare(`${SELECT_BASE} WHERE username = ? ORDER BY created_at DESC`)
      .bind(username)
      .all<AlertRow>();
    return (result.results ?? []).map(mapRow);
  }

  async listActive(username?: string): Promise<Alert[]> {
    if (username) {
      const result = await this.db
        .prepare(`${SELECT_BASE} WHERE username = ? AND status = ? ORDER BY created_at DESC`)
        .bind(username, 'active')
        .all<AlertRow>();
      return (result.results ?? []).map(mapRow);
    } else {
      // Get all active alerts (for cron job)
      const result = await this.db
        .prepare(`${SELECT_BASE} WHERE status = ? ORDER BY created_at DESC`)
        .bind('active')
        .all<AlertRow>();
      return (result.results ?? []).map(mapRow);
    }
  }

  async findById(id: string, username: string | null): Promise<Alert | null> {
    if (username === null) {
      // Admin: get alert without user filter
      const row = await this.db
        .prepare(`${SELECT_BASE} WHERE id = ?`)
        .bind(id)
        .first<AlertRow>();
      return row ? mapRow(row) : null;
    }
    const row = await this.db
      .prepare(`${SELECT_BASE} WHERE id = ? AND username = ?`)
      .bind(id, username)
      .first<AlertRow>();
    return row ? mapRow(row) : null;
  }

  async create(data: CreateAlertRequest, username: string): Promise<Alert> {
    if (!username || username.trim().length === 0) {
      throw new Error('username is required and cannot be null or empty');
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const notes = data.notes?.trim() ?? null;

    await this.db
      .prepare(
        `INSERT INTO alerts (id, symbol, direction, threshold, status, channel, notes, username, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        data.symbol,
        data.direction,
        data.threshold,
        data.channel || 'notification',
        notes,
        username,
        now,
        now
      )
      .run();

    const created = await this.findById(id, username);
    if (!created) {
      throw new Error('failed to load created alert after creation');
    }

    if (created.username !== username) {
      throw new Error(`Alert created with incorrect username: expected ${username}, got ${created.username}`);
    }

    return created;
  }

  async update(id: string, data: UpdateAlertRequest, username: string | null): Promise<Alert> {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.symbol !== undefined) {
      updates.push('symbol = ?');
      values.push(data.symbol);
    }
    if (data.direction !== undefined) {
      updates.push('direction = ?');
      values.push(data.direction);
    }
    if (data.threshold !== undefined) {
      updates.push('threshold = ?');
      values.push(data.threshold);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.channel !== undefined) {
      updates.push('channel = ?');
      values.push(data.channel);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      values.push(data.notes);
    }

    if (updates.length === 0) {
      // No updates, return current alert
      const alert = await this.findById(id, username);
      if (!alert) {
        throw new Error('Alert not found');
      }
      return alert;
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());

    if (username === null) {
      // Admin: update without user filter
      values.push(id);
      await this.db
        .prepare(`UPDATE alerts SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();
    } else {
      // Regular user: update with user filter
      values.push(id, username);
      await this.db
        .prepare(`UPDATE alerts SET ${updates.join(', ')} WHERE id = ? AND username = ?`)
        .bind(...values)
        .run();
    }

    const updated = await this.findById(id, username);
    if (!updated) {
      throw new Error('Alert not found after update');
    }

    return updated;
  }

  async delete(id: string, username: string | null): Promise<void> {
    if (username === null) {
      // Admin: delete without user filter
      await this.db.prepare('DELETE FROM alerts WHERE id = ?').bind(id).run();
    } else {
      // Regular user: delete with user filter
      await this.db.prepare('DELETE FROM alerts WHERE id = ? AND username = ?').bind(id, username).run();
    }
  }
}

