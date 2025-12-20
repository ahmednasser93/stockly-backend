-- Add user_id column to alerts table for user association
-- This allows alerts to be properly scoped to authenticated users

-- Add user_id column (nullable initially to allow migration of existing data)
ALTER TABLE alerts ADD COLUMN user_id TEXT;

-- Create index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);

-- Note: After data migration is complete, we can make user_id NOT NULL
-- and add a foreign key constraint. However, SQLite doesn't support
-- ALTER TABLE for foreign keys, so we may need to recreate the table
-- if we want to enforce referential integrity at the database level.






