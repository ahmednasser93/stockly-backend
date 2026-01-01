# Financial Modeling Prep (FMP) Endpoints

This document lists all the Financial Modeling Prep (FMP) API endpoints currently being used in the application.

**Base URL**: `https://financialmodelingprep.com/stable` (Defined in `src/util.ts`)

**Last Updated**: 2024 - Added 9 new features (Market Status, Social Sentiment, Crypto Quotes, Key Executives, Analyst Estimates, Financial Growth, DCF, Financial Scores, Calendar Events)

## Stock Data

### Quote
Fetches real-time stock price and changes.
- **Reference**: `src/repositories/external/QuotesRepository.ts`, `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /quote?symbol={symbol}&apikey={apikey}
  ```

### Historical Price
Fetches daily historical price data for charts (last 365 days).
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /historical-price-full/{symbol}?serietype=line&timeseries=365&apikey={apikey}
  ```

### Profile
Fetches company profile information (description, website, sector, etc.).
The application attempts multiple endpoints in order until one succeeds:
- **Reference**: `src/repositories/external/profile-fetcher.ts`, `src/repositories/external/StockRepository.ts`
- **Endpoints (in order of attempt)**:
  1. `GET /profile?symbol={symbol}&apikey={apikey}`
  2. `GET /profile/{symbol}?apikey={apikey}`
  3. `GET /company/profile/{symbol}?apikey={apikey}`
  4. `GET https://financialmodelingprep.com/api/v3/profile/{symbol}?apikey={apikey}` (Fallback to v3)

### Company Image
Constructed URL for the company logo.
- **Reference**: `src/repositories/external/profile-fetcher.ts`, `src/repositories/external/StockRepository.ts`
- **URL**:
  ```http
  https://images.financialmodelingprep.com/symbol/{symbol}.png
  ```
  *(Note: Symbol is uppercased in the application)*

## Financial Data

### Key Metrics
Fetches key financial metrics (PE ratio, etc.).
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /key-metrics/{symbol}?limit=4&apikey={apikey}
  ```

### Income Statement
Fetches annual income statements.
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /income-statement/{symbol}?limit=4&apikey={apikey}
  ```

### Ratios
Fetches financial ratios.
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /ratios/{symbol}?limit=3&apikey={apikey}
  ```

### Key Executives
Fetches key executives information (titles, names, pay).
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /key-executives?symbol={symbol}&apikey={apikey}
  ```

### Analyst Estimates
Fetches analyst estimates (revenue, EPS, etc.).
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /analyst-estimates?symbol={symbol}&period={annual|quarter}&apikey={apikey}
  ```

### Financial Growth
Fetches financial growth metrics (YoY revenue, net income, etc.).
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /financial-growth?symbol={symbol}&apikey={apikey}
  ```

### Discounted Cash Flow (DCF)
Fetches DCF valuation data.
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /discounted-cash-flow?symbol={symbol}&apikey={apikey}
  ```

### Financial Scores
Fetches financial scores (Altman Z-Score, Piotroski Score, etc.).
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /financial-scores?symbol={symbol}&apikey={apikey}
  ```

## Market Data

### Market Status
Checks if the stock market is currently open.
- **Reference**: `src/repositories/external/MarketRepository.ts`
- **Endpoint**:
  ```http
  GET /is-the-market-open?apikey={apikey}
  ```

### Social Sentiment
Fetches trending stocks with social sentiment (bullish/bearish).
- **Reference**: `src/repositories/external/MarketRepository.ts`
- **Endpoint**:
  ```http
  GET /social-sentiment/trending?type={bullish|bearish}&apikey={apikey}
  ```

### Crypto Quotes
Fetches cryptocurrency quotes.
- **Reference**: `src/repositories/external/MarketRepository.ts`
- **Endpoint**:
  ```http
  GET /quotes/crypto?apikey={apikey}
  ```

## Calendar Events

### Earnings Calendar
Fetches upcoming earnings reports.
- **Reference**: `src/repositories/external/CalendarRepository.ts`
- **Endpoint**:
  ```http
  GET /earning_calendar?from={date}&to={date}&apikey={apikey}
  ```

### Dividend Calendar
Fetches upcoming dividend ex-dates.
- **Reference**: `src/repositories/external/CalendarRepository.ts`
- **Endpoint**:
  ```http
  GET /stock_dividend_calendar?from={date}&to={date}&apikey={apikey}
  ```

### IPO Calendar
Fetches upcoming IPOs.
- **Reference**: `src/repositories/external/CalendarRepository.ts`
- **Endpoint**:
  ```http
  GET /ipo_calendar?from={date}&to={date}&apikey={apikey}
  ```

### Stock Split Calendar
Fetches upcoming stock splits.
- **Reference**: `src/repositories/external/CalendarRepository.ts`
- **Endpoint**:
  ```http
  GET /stock_split_calendar?from={date}&to={date}&apikey={apikey}
  ```

## News

### Stock News
Fetches latest news articles for a specific stock.
- **Reference**: `src/repositories/external/StockRepository.ts`
- **Endpoint**:
  ```http
  GET /stock_news?tickers={symbol}&limit=6&apikey={apikey}
  ```
