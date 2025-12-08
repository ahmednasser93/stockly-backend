-- Add news_favorite_symbols to user_settings
ALTER TABLE user_settings ADD COLUMN news_favorite_symbols TEXT;

-- Create user_saved_news table
CREATE TABLE IF NOT EXISTS user_saved_news (
  user_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  symbol TEXT,
  title TEXT,
  url TEXT,
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_news_user_id ON user_saved_news (user_id);
