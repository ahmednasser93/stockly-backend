-- Migration 019: Make username required (NOT NULL) and enforce uniqueness
-- This migration ensures all users have a username and enforces uniqueness constraints

-- Step 1: Ensure username uniqueness - resolve any duplicate usernames
-- Check for case-insensitive duplicates and append user_id suffix to duplicates
UPDATE users 
SET username = username || '_' || SUBSTR(id, 1, 8)
WHERE LOWER(username) IN (
  SELECT LOWER(username) 
  FROM users 
  WHERE username IS NOT NULL
  GROUP BY LOWER(username) 
  HAVING COUNT(*) > 1
) AND id NOT IN (
  SELECT MIN(id) 
  FROM users 
  WHERE username IS NOT NULL
  GROUP BY LOWER(username)
);

-- Step 2: Ensure all users have username (final check)
UPDATE users 
SET username = REPLACE(LOWER(SUBSTR(email, 1, INSTR(email, '@') - 1)), '.', '_') || '_' || SUBSTR(id, 1, 8)
WHERE username IS NULL;

-- Step 3: Verify unique index exists (should already exist from migration 012)
-- Recreate to ensure it's active
CREATE UNIQUE INDEX IF NOT EXISTS idx_username_lower 
ON users(LOWER(username)) 
WHERE username IS NOT NULL;

-- Step 4: For other tables, ensure no NULL usernames before making NOT NULL
-- Note: SQLite doesn't support ALTER COLUMN to add NOT NULL constraint directly
-- We'll need to recreate tables or use CHECK constraints
-- For now, we ensure data integrity and will enforce NOT NULL in application code

-- Verify all records have username
-- Alerts
UPDATE alerts SET username = 'unknown' WHERE username IS NULL;

-- User push tokens
UPDATE user_push_tokens SET username = 'unknown' WHERE username IS NULL;

-- Notifications log
UPDATE notifications_log SET username = 'unknown' WHERE username IS NULL;

-- User settings
UPDATE user_settings SET username = 'unknown' WHERE username IS NULL;

-- User notification preferences
UPDATE user_notification_preferences SET username = 'unknown' WHERE username IS NULL;

-- User favorite stocks
UPDATE user_favorite_stocks SET username = 'unknown' WHERE username IS NULL;

-- User saved news
UPDATE user_saved_news SET username = 'unknown' WHERE username IS NULL;

-- Note: SQLite doesn't support ALTER COLUMN to add NOT NULL constraints
-- Application code will enforce NOT NULL requirements
-- Database-level enforcement would require recreating tables, which is risky in production
-- Instead, we rely on application-level validation and the data migration above





