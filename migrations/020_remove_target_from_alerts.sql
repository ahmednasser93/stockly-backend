-- Remove target column from alerts table
-- Target is no longer needed as notifications now use username to fetch all user devices
-- This column was made optional in previous changes but is now being removed entirely
-- 
-- SQLite DROP COLUMN requires copying data to a new table structure

-- Create new alerts table without target column
CREATE TABLE alerts_new (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above','below')),
  threshold REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  channel TEXT NOT NULL,
  notes TEXT,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Copy data from old table to new table (excluding target column)
INSERT INTO alerts_new (id, symbol, direction, threshold, status, channel, notes, username, created_at, updated_at)
SELECT id, symbol, direction, threshold, status, channel, notes, username, created_at, updated_at
FROM alerts;

-- Drop old table
DROP TABLE alerts;

-- Rename new table to original name
ALTER TABLE alerts_new RENAME TO alerts;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts (symbol);
