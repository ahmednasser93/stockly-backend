-- Create users table for Google OAuth authentication
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                    -- Google user ID (sub claim)
  email TEXT UNIQUE NOT NULL,
  username TEXT,                          -- Custom username (nullable initially, set after first login)
  name TEXT,
  picture TEXT,                           -- Profile picture URL
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_login_at INTEGER
);

-- Case-insensitive unique index on username (only for non-null usernames)
CREATE UNIQUE INDEX IF NOT EXISTS idx_username_lower 
ON users(LOWER(username)) 
WHERE username IS NOT NULL;

-- Index on email (already unique, but index helps with lookups)
CREATE INDEX IF NOT EXISTS idx_email ON users(email);

-- Index on created_at for analytics
CREATE INDEX IF NOT EXISTS idx_created_at ON users(created_at);
