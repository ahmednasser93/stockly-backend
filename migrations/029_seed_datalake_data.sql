-- Seed Initial Datalake Data
-- Inserts default FMP datalake, all API endpoints, and default mappings

-- Insert default FMP datalake
INSERT OR IGNORE INTO datalakes (id, name, base_url, api_key, auth_type, auth_key_name, is_active, created_at, updated_at)
VALUES (
  'fmp-default',
  'Financial Modeling Prep (FMP)',
  'https://financialmodelingprep.com/stable',
  NULL, -- API key stored in environment/config
  'query_param',
  'apikey',
  1,
  unixepoch(),
  unixepoch()
);

-- Insert all API endpoints from FMP API documentation
-- Stock Data Endpoints
INSERT OR IGNORE INTO api_endpoints (id, name, description, endpoint_path, http_method, requires_symbol, created_at)
VALUES
  ('quote', 'Quote', 'Get real-time stock quote data', '/quote', 'GET', 1, unixepoch()),
  ('profile', 'Profile', 'Get company profile information', '/profile', 'GET', 1, unixepoch()),
  ('historical-price-full', 'Historical Price Full', 'Get historical price data', '/historical-price-full/{symbol}', 'GET', 1, unixepoch()),
  ('key-metrics', 'Key Metrics', 'Get key financial metrics', '/key-metrics/{symbol}', 'GET', 1, unixepoch()),
  ('income-statement', 'Income Statement', 'Get income statement data', '/income-statement/{symbol}', 'GET', 1, unixepoch()),
  ('ratios', 'Ratios', 'Get financial ratios', '/ratios/{symbol}', 'GET', 1, unixepoch()),
  ('key-executives', 'Key Executives', 'Get key executives information', '/key-executives', 'GET', 1, unixepoch()),
  ('analyst-estimates', 'Analyst Estimates', 'Get analyst estimates', '/analyst-estimates', 'GET', 1, unixepoch()),
  ('financial-growth', 'Financial Growth', 'Get financial growth metrics', '/financial-growth', 'GET', 1, unixepoch()),
  ('discounted-cash-flow', 'DCF', 'Get discounted cash flow valuation', '/discounted-cash-flow', 'GET', 1, unixepoch()),
  ('financial-scores', 'Financial Scores', 'Get financial health scores', '/financial-scores', 'GET', 1, unixepoch()),

-- Market Data Endpoints
  ('market-status', 'Market Status', 'Check if stock market is open', '/is-the-market-open', 'GET', 0, unixepoch()),
  ('social-sentiment-trending', 'Social Sentiment Trending', 'Get trending stocks by social sentiment', '/social-sentiment/trending', 'GET', 0, unixepoch()),
  ('crypto-quotes', 'Crypto Quotes', 'Get cryptocurrency quotes', '/quotes/crypto', 'GET', 0, unixepoch()),
  ('stock-market-gainers', 'Stock Market Gainers', 'Get top gaining stocks', '/v3/stock_market/gainers', 'GET', 0, unixepoch()),
  ('stock-market-losers', 'Stock Market Losers', 'Get top losing stocks', '/v3/stock_market/losers', 'GET', 0, unixepoch()),
  ('stock-market-actives', 'Stock Market Actives', 'Get most active stocks', '/v3/stock_market/actives', 'GET', 0, unixepoch()),
  ('stock-screener', 'Stock Screener', 'Screen stocks by criteria', '/v3/stock-screener', 'GET', 0, unixepoch()),
  ('sectors-performance', 'Sectors Performance', 'Get sector performance data', '/v3/sectors-performance', 'GET', 0, unixepoch()),

-- Calendar Endpoints
  ('earning-calendar', 'Earnings Calendar', 'Get earnings calendar events', '/earning_calendar', 'GET', 0, unixepoch()),
  ('dividend-calendar', 'Dividend Calendar', 'Get dividend calendar events', '/stock_dividend_calendar', 'GET', 0, unixepoch()),
  ('ipo-calendar', 'IPO Calendar', 'Get IPO calendar events', '/ipo_calendar', 'GET', 0, unixepoch()),
  ('stock-split-calendar', 'Stock Split Calendar', 'Get stock split calendar events', '/stock_split_calendar', 'GET', 0, unixepoch()),

-- News Endpoints
  ('stock-news', 'Stock News', 'Get stock-specific news', '/stock_news', 'GET', 1, unixepoch()),
  ('news-stock', 'News Stock', 'Get news for stocks with pagination', '/news/stock', 'GET', 1, unixepoch()),
  ('news-general-latest', 'General Latest News', 'Get general market news', '/news/general-latest', 'GET', 0, unixepoch()),

-- Search Endpoints
  ('search-name', 'Search Name', 'Search stocks by company name', '/search-name', 'GET', 0, unixepoch()),
  ('search-symbol', 'Search Symbol', 'Search stocks by symbol', '/search-symbol', 'GET', 0, unixepoch()),

-- Historical Data Endpoints
  ('historical-dividend', 'Historical Dividend', 'Get historical dividend data', '/v3/historical-price-full/stock_dividend/{symbol}', 'GET', 1, unixepoch()),
  ('profile-v3', 'Profile V3', 'Get company profile (v3 endpoint)', '/v3/profile/{symbol}', 'GET', 1, unixepoch()),
  ('historical-chart-30min', 'Historical Chart 30min', 'Get 30-minute interval historical chart data', '/historical-chart/30min', 'GET', 1, unixepoch());

-- Create default mappings: All endpoints mapped to FMP, FMP selected for all
INSERT OR IGNORE INTO datalake_api_mappings (id, api_endpoint_id, datalake_id, is_selected, created_at, updated_at)
SELECT 
  'fmp-' || api_endpoints.id,
  api_endpoints.id,
  'fmp-default',
  1, -- All FMP mappings are selected by default
  unixepoch(),
  unixepoch()
FROM api_endpoints;
