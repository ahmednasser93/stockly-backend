-- Migration 009: Add OHLC (Open, High, Low, Close) fields to historical_prices table
-- This migration extends the historical_prices table to support candlestick charts
-- by adding open, high, and low price fields. The existing 'price' field represents the closing price.

-- Add OHLC columns (all nullable to maintain backward compatibility with existing data)
ALTER TABLE historical_prices ADD COLUMN open REAL;
ALTER TABLE historical_prices ADD COLUMN high REAL;
ALTER TABLE historical_prices ADD COLUMN low REAL;

-- Note: The existing 'price' column represents the closing price.
-- For backward compatibility, we keep it as is and add 'close' as an alias in application code.
-- Optionally, we could add a 'close' column and migrate data, but that's not necessary
-- since we can map 'price' to 'close' in the application layer.

-- Add index for better query performance on date range queries with OHLC data
CREATE INDEX IF NOT EXISTS idx_historical_prices_date_range ON historical_prices (symbol, date);


