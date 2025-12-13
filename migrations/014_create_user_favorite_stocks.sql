-- Create user_favorite_stocks table for storing user's dashboard stocks
-- This enables syncing selected stocks across devices (web and mobile)
CREATE TABLE IF NOT EXISTS user_favorite_stocks (
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,  -- Order in which stocks appear on dashboard
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (user_id, symbol),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_favorite_stocks_user_id ON user_favorite_stocks(user_id);

-- Index on symbol for analytics (optional, but useful for tracking popular stocks)
CREATE INDEX IF NOT EXISTS idx_user_favorite_stocks_symbol ON user_favorite_stocks(symbol);
