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
  user_id: string | null;
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
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SELECT_BASE = `SELECT id, symbol, direction, threshold, status, channel, target, notes, user_id, created_at, updated_at FROM alerts`;

export async function listAlerts(env: Env, userId: string): Promise<AlertRecord[]> {
  const statement = env.stockly.prepare(`${SELECT_BASE} WHERE user_id = ? ORDER BY created_at DESC`);
  const result = await statement.bind(userId).all<AlertRow>();
  return (result.results ?? []).map(mapRow);
}

export async function listActiveAlerts(env: Env, userId?: string): Promise<AlertRecord[]> {
  if (userId) {
    // Filter by user for API endpoints
    const statement = env.stockly.prepare(
      `${SELECT_BASE} WHERE user_id = ? AND status = ? ORDER BY created_at DESC`
    );
    const result = await statement.bind(userId, "active").all<AlertRow>();
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

export async function getAlert(env: Env, id: string, userId: string): Promise<AlertRecord | null> {
  const row = await env.stockly
    .prepare(`${SELECT_BASE} WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<AlertRow>();

  return row ? mapRow(row) : null;
}

export async function createAlert(env: Env, draft: AlertDraft, userId: string): Promise<AlertRecord> {
  try {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const notes = draft.notes?.trim() ?? null;
    
    await env.stockly
      .prepare(
        `INSERT INTO alerts (id, symbol, direction, threshold, status, channel, target, notes, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, draft.symbol, draft.direction, draft.threshold, draft.channel, draft.target, notes, userId, now, now)
      .run();

    const created = await getAlert(env, id, userId);
    if (!created) {
      throw new Error("failed to load created alert after creation");
    }
    return created;
  } catch (error) {
    if (error instanceof Error) {
      // Check for common database errors
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('unique constraint') || errorMsg.includes('unique')) {
        throw new Error("An alert already exists for this symbol and threshold");
      }
      if (errorMsg.includes('check constraint') || errorMsg.includes('constraint')) {
        throw new Error("Invalid alert data: validation constraint failed");
      }
      if (errorMsg.includes('not null') || errorMsg.includes('null')) {
        throw new Error("Missing required alert data");
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
  userId: string
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
      return await getAlert(env, id, userId);
    }

    fields.push("updated_at = ?");
    const updatedAt = new Date().toISOString();
    values.push(updatedAt, id, userId);

    const sql = `UPDATE alerts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`;
    await env.stockly.prepare(sql).bind(...values).run();

    return await getAlert(env, id, userId);
  } catch (error) {
    if (error instanceof Error) {
      // Check for common database errors
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('check constraint') || errorMsg.includes('constraint')) {
        throw new Error("Invalid alert data: validation constraint failed");
      }
      if (errorMsg.includes('not null') || errorMsg.includes('null')) {
        throw new Error("Missing required alert data");
      }
      // Re-throw with original message for other errors
      throw new Error(`Database error: ${error.message}`);
    }
    throw error;
  }
}

export async function deleteAlert(env: Env, id: string, userId: string): Promise<boolean> {
  const result = await env.stockly
    .prepare(`DELETE FROM alerts WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();

  const meta = (result as any)?.meta ?? {};
  if (typeof meta.changes === "number") {
    return meta.changes > 0;
  }
  return Boolean((result as any)?.success);
}
