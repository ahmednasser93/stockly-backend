import type { Env } from "../index";
import type {
  AlertDraft,
  AlertRecord,
  AlertUpdate,
  AlertDirection,
  AlertStatus,
  AlertChannel,
} from "./types";

type AlertRow = {
  id: string;
  symbol: string;
  direction: AlertDirection;
  threshold: number;
  status: AlertStatus;
  channel: AlertChannel;
  target: string;
  notes: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
};

const mapRow = (row: AlertRow): AlertRecord => ({
  id: row.id,
  symbol: row.symbol,
  direction: row.direction,
  threshold: row.threshold,
  status: row.status,
  channel: row.channel,
  target: row.target,
  notes: row.notes,
  username: row.username,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SELECT_BASE = `SELECT id, symbol, direction, threshold, status, channel, target, notes, username, created_at, updated_at FROM alerts`;

export async function listAlerts(env: Env, username: string | null): Promise<AlertRecord[]> {
  if (username === null) {
    // Admin: get all alerts
    const statement = env.stockly.prepare(`${SELECT_BASE} ORDER BY created_at DESC`);
    const result = await statement.all<AlertRow>();
    return (result.results ?? []).map(mapRow);
  }
  // Filter alerts by username - this ensures users only see their own alerts
  // Important: This query will NOT return alerts with NULL username
  const statement = env.stockly.prepare(`${SELECT_BASE} WHERE username = ? ORDER BY created_at DESC`);
  const result = await statement.bind(username).all<AlertRow>();
  const alerts = (result.results ?? []).map(mapRow);

  // Log for debugging - check if any alerts have null username
  const nullUsernameCount = alerts.filter(a => a.username === null).length;
  if (nullUsernameCount > 0) {
    console.warn(`Warning: Found ${nullUsernameCount} alerts with null username for username ${username}`);
  }

  return alerts;
}

export async function listActiveAlerts(env: Env, username?: string): Promise<AlertRecord[]> {
  if (username) {
    // Filter by username for API endpoints
    const statement = env.stockly.prepare(
      `${SELECT_BASE} WHERE username = ? AND status = ? ORDER BY created_at DESC`
    );
    const result = await statement.bind(username, "active").all<AlertRow>();
    return (result.results ?? []).map(mapRow);
  } else {
    // Get all active alerts (for cron job)
    const statement = env.stockly.prepare(
      `${SELECT_BASE} WHERE status = ? ORDER BY created_at DESC`
    );
    const result = await statement.bind("active").all<AlertRow>();
    return (result.results ?? []).map(mapRow);
  }
}

export async function getAlert(env: Env, id: string, username: string | null): Promise<AlertRecord | null> {
  if (username === null) {
    // Admin: get alert without user filter
    const row = await env.stockly
      .prepare(`${SELECT_BASE} WHERE id = ?`)
      .bind(id)
      .first<AlertRow>();
    return row ? mapRow(row) : null;
  }
  const row = await env.stockly
    .prepare(`${SELECT_BASE} WHERE id = ? AND username = ?`)
    .bind(id, username)
    .first<AlertRow>();

  return row ? mapRow(row) : null;
}

export async function createAlert(env: Env, draft: AlertDraft, username: string): Promise<AlertRecord> {
  // Validate username is not null or empty
  if (!username || username.trim().length === 0) {
    throw new Error("username is required and cannot be null or empty");
  }

  try {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const notes = draft.notes?.trim() ?? null;

    console.log(`Creating alert with username: ${username}, symbol: ${draft.symbol}`);

    await env.stockly
      .prepare(
        `INSERT INTO alerts (id, symbol, direction, threshold, status, channel, target, notes, username, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, draft.symbol, draft.direction, draft.threshold, draft.channel, draft.target, notes, username, now, now)
      .run();

    const created = await getAlert(env, id, username);
    if (!created) {
      throw new Error("failed to load created alert after creation");
    }

    // Verify the created alert has the correct username
    if (created.username !== username) {
      console.error(`Alert created with mismatched username! Expected: ${username}, Got: ${created.username}, AlertId: ${id}`);
      throw new Error(`Alert created with incorrect username: expected ${username}, got ${created.username}`);
    }

    console.log(`Alert created successfully: id=${id}, username=${created.username}, symbol=${created.symbol}`);
    return created;
  } catch (error) {
    if (error instanceof Error) {
      // Check for common database errors
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('unique constraint') || errorMsg.includes('unique')) {
        throw new Error("An alert already exists for this symbol and threshold");
      }
      if (errorMsg.includes('not null') || errorMsg.includes('null')) {
        throw new Error("Missing required alert data");
      }
      if (errorMsg.includes('check constraint') || errorMsg.includes('constraint')) {
        throw new Error("Invalid alert data: validation constraint failed");
      }
      // Re-throw with original message for other errors
      throw new Error(`Database error: ${error.message}`);
    }
    throw error;
  }
}

export async function updateAlert(
  env: Env,
  id: string,
  updates: AlertUpdate,
  username: string | null
): Promise<AlertRecord | null> {
  try {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.symbol) {
      fields.push("symbol = ?");
      values.push(updates.symbol);
    }
    if (updates.direction) {
      fields.push("direction = ?");
      values.push(updates.direction);
    }
    if (typeof updates.threshold === "number") {
      fields.push("threshold = ?");
      values.push(updates.threshold);
    }
    if (updates.status) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.channel) {
      fields.push("channel = ?");
      values.push(updates.channel);
    }
    if (updates.target) {
      fields.push("target = ?");
      values.push(updates.target);
    }
    if (updates.notes !== undefined) {
      fields.push("notes = ?");
      values.push(updates.notes);
    }

    if (!fields.length) {
      return await getAlert(env, id, username);
    }

    fields.push("updated_at = ?");
    const updatedAt = new Date().toISOString();
    values.push(updatedAt, id);

    if (username === null) {
      // Admin: update without user filter
      const sql = `UPDATE alerts SET ${fields.join(", ")} WHERE id = ?`;
      await env.stockly.prepare(sql).bind(...values).run();
    } else {
      values.push(username);
      const sql = `UPDATE alerts SET ${fields.join(", ")} WHERE id = ? AND username = ?`;
      await env.stockly.prepare(sql).bind(...values).run();
    }

    return await getAlert(env, id, username);
  } catch (error) {
    if (error instanceof Error) {
      // Check for common database errors
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('not null') || errorMsg.includes('null')) {
        throw new Error("Missing required alert data");
      }
      if (errorMsg.includes('check constraint') || errorMsg.includes('constraint')) {
        throw new Error("Invalid alert data: validation constraint failed");
      }
      // Re-throw with original message for other errors
      throw new Error(`Database error: ${error.message}`);
    }
    throw error;
  }
}

export async function deleteAlert(env: Env, id: string, username: string | null): Promise<boolean> {
  let result;
  if (username === null) {
    // Admin: delete without user filter
    result = await env.stockly
      .prepare(`DELETE FROM alerts WHERE id = ?`)
      .bind(id)
      .run();
  } else {
    result = await env.stockly
      .prepare(`DELETE FROM alerts WHERE id = ? AND username = ?`)
      .bind(id, username)
      .run();
  }

  const meta = (result as any)?.meta ?? {};
  if (typeof meta.changes === "number") {
    return meta.changes > 0;
  }
  return Boolean((result as any)?.success);
}
