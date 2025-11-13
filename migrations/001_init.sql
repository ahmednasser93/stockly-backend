CREATE TABLE IF NOT EXISTS stock_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    day_low REAL,
    day_high REAL,
    volume INTEGER,
    timestamp INTEGER NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_symbol ON stock_prices(symbol);
CREATE INDEX IF NOT EXISTS idx_timestamp ON stock_prices(timestamp);
