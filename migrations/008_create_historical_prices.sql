-- Create historical_prices table for storing historical price data
CREATE TABLE IF NOT EXISTS historical_prices (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  price REAL NOT NULL,
  volume INTEGER,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol ON historical_prices (symbol);
CREATE INDEX IF NOT EXISTS idx_historical_prices_date ON historical_prices (date);

