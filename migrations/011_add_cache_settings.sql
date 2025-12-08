-- Add cache settings to user_settings table
ALTER TABLE user_settings ADD COLUMN cache_stale_time_minutes INTEGER DEFAULT 5;
ALTER TABLE user_settings ADD COLUMN cache_gc_time_minutes INTEGER DEFAULT 10;

