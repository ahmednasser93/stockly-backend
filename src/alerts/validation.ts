import type { AlertDraft, AlertUpdate, AlertChannel, AlertDirection, AlertStatus } from "./types";

type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

const DIRECTIONS: AlertDirection[] = ["above", "below"];
const CHANNELS: AlertChannel[] = ["notification"];
const STATUSES: AlertStatus[] = ["active", "paused"];

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const coerceString = (value: unknown): string | null =>
  typeof value === "string" ? value.trim() : null;

export function validateNewAlert(payload: unknown): ValidationResult<AlertDraft> {
  const errors: string[] = [];
  const data = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;

  const rawSymbol = coerceString(data.symbol);
  if (!rawSymbol) {
    errors.push("symbol is required");
  }

  const rawDirection = coerceString(data.direction);
  if (!rawDirection || !DIRECTIONS.includes(rawDirection as AlertDirection)) {
    errors.push("direction must be 'above' or 'below'");
  }

  const threshold = typeof data.threshold === "number" ? data.threshold : Number.NaN;
  if (!Number.isFinite(threshold) || threshold <= 0) {
    errors.push("threshold must be a positive number");
  }

  const rawChannel = coerceString(data.channel);
  if (!rawChannel || !CHANNELS.includes(rawChannel as AlertChannel)) {
    errors.push("channel must be 'notification'");
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const draft: AlertDraft = {
    symbol: normalizeSymbol(rawSymbol!),
    direction: rawDirection as AlertDirection,
    threshold,
    channel: rawChannel as AlertChannel,
  };

  if (typeof data.notes === "string" && data.notes.trim().length) {
    draft.notes = data.notes.trim();
  }

  return { ok: true, data: draft };
}

export function validateAlertUpdate(payload: unknown): ValidationResult<AlertUpdate> {
  const errors: string[] = [];
  const data = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const update: AlertUpdate = {};

  if (typeof data.symbol === "string" && data.symbol.trim()) {
    update.symbol = normalizeSymbol(data.symbol);
  }

  if (typeof data.direction === "string") {
    const normalized = data.direction.trim().toLowerCase();
    if (DIRECTIONS.includes(normalized as AlertDirection)) {
      update.direction = normalized as AlertDirection;
    } else {
      errors.push("direction must be 'above' or 'below'");
    }
  }

  if (data.threshold !== undefined) {
    const threshold = typeof data.threshold === "number" ? data.threshold : Number.NaN;
    if (Number.isFinite(threshold) && threshold > 0) {
      update.threshold = threshold;
    } else {
      errors.push("threshold must be a positive number");
    }
  }

  if (typeof data.channel === "string") {
    const normalized = data.channel.trim().toLowerCase();
    if (CHANNELS.includes(normalized as AlertChannel)) {
      update.channel = normalized as AlertChannel;
    } else {
      errors.push("channel must be 'notification'");
    }
  }

  // Target field has been removed - notifications now use username to find all user devices

  if (data.status !== undefined) {
    const normalized = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
    if (STATUSES.includes(normalized as AlertStatus)) {
      update.status = normalized as AlertStatus;
    } else {
      errors.push("status must be 'active' or 'paused'");
    }
  }

  if (data.notes !== undefined) {
    if (data.notes === null || (typeof data.notes === "string" && !data.notes.trim())) {
      update.notes = null;
    } else if (typeof data.notes === "string") {
      update.notes = data.notes.trim();
    } else {
      errors.push("notes must be a string");
    }
  }

  if (!Object.keys(update).length) {
    errors.push("at least one field must be provided");
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true, data: update };
}

export type { ValidationResult };
