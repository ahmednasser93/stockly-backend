-- Create notifications_log table for tracking sent notifications
CREATE TABLE IF NOT EXISTS notifications_log (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  threshold REAL NOT NULL,
  price REAL NOT NULL,
  direction TEXT NOT NULL,
  push_token TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_log_alert_id ON notifications_log (alert_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_status ON notifications_log (status);
CREATE INDEX IF NOT EXISTS idx_notifications_log_sent_at ON notifications_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_log_symbol ON notifications_log (symbol);

