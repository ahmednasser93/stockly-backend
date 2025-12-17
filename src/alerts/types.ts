export type AlertDirection = "above" | "below";
export type AlertStatus = "active" | "paused";
export type AlertChannel = "notification";

export interface AlertRecord {
  id: string;
  symbol: string;
  direction: AlertDirection;
  threshold: number;
  status: AlertStatus;
  channel: AlertChannel;
  notes: string | null;
  username: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertDraft {
  symbol: string;
  direction: AlertDirection;
  threshold: number;
  channel: AlertChannel;
  notes?: string;
}

export interface AlertUpdate {
  symbol?: string;
  direction?: AlertDirection;
  threshold?: number;
  status?: AlertStatus;
  channel?: AlertChannel;
  notes?: string | null;
}

export interface AlertStateSnapshot {
  lastConditionMet: boolean;
  lastPrice?: number;
  lastTriggeredAt?: number;
  lastNotifiedPrice?: number; // Price when last notification was sent
  lastNotifiedAt?: number; // Timestamp when last notification was sent
}
