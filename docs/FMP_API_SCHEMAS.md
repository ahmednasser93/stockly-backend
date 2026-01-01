# FMP API Request/Response Schemas

This document contains the request and response schemas for all Financial Modeling Prep (FMP) API endpoints used by the Stockly backend. This documentation is intended for external teams building compatible datalake endpoints.

**Base URL**: `https://financialmodelingprep.com/stable`  
**Authentication**: All endpoints require an `apikey` query parameter.

---

## 1. Quote Endpoint

**Path**: `/quote`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol (e.g., "AAPL")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /quote?symbol=AAPL&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of quote objects (typically one item for single symbol):

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 175.43,
    "changesPercentage": 1.35,
    "change": 2.34,
    "dayLow": 172.50,
    "dayHigh": 176.10,
    "yearHigh": 198.23,
    "yearLow": 164.08,
    "marketCap": 2800000000000,
    "priceAvg50": 180.25,
    "priceAvg200": 175.10,
    "volume": 50000000,
    "avgVolume": 45000000,
    "exchange": "NASDAQ",
    "open": 173.20,
    "previousClose": 173.09,
    "eps": 6.11,
    "pe": 28.70,
    "earningsAnnouncement": "2024-01-25T16:30:00.000+0000",
    "sharesOutstanding": 15728700000,
    "timestamp": 1704067200
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 2. Profile Endpoint

**Path**: `/profile` (or `/profile/{symbol}` or `/company/profile/{symbol}`)  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol (e.g., "AAPL")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /profile?symbol=AAPL&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of profile objects (typically one item):

```json
[
  {
    "symbol": "AAPL",
    "companyName": "Apple Inc.",
    "name": "Apple Inc.",
    "industry": "Consumer Electronics",
    "sector": "Technology",
    "description": "Apple Inc. designs, manufactures, and markets...",
    "website": "https://www.apple.com",
    "image": "https://images.financialmodelingprep.com/symbol/AAPL.png",
    "beta": 1.25,
    "lastDiv": 0.24,
    "dividendYield": 0.55,
    "price": 175.43
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 3. Historical Price Full Endpoint

**Path**: `/historical-price-full/{symbol}`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol in path (e.g., "AAPL")
- `serietype` (string, optional): Series type (e.g., "line", "candle")
- `timeseries` (number, optional): Number of days (e.g., 365)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /historical-price-full/AAPL?serietype=line&timeseries=365&apikey=YOUR_API_KEY
```

### Response Schema
```json
{
  "symbol": "AAPL",
  "historical": [
    {
      "date": "2024-01-15",
      "open": 185.20,
      "high": 186.50,
      "low": 184.80,
      "close": 185.90,
      "adjClose": 185.90,
      "volume": 45000000,
      "unadjustedVolume": 45000000,
      "change": 0.70,
      "changePercent": 0.38,
      "vwap": 185.50,
      "label": "January 15, 2024",
      "changeOverTime": 0.0038
    }
  ]
}
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 4. Key Metrics Endpoint

**Path**: `/key-metrics/{symbol}`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol in path (e.g., "AAPL")
- `limit` (number, optional): Number of periods to return (default: 4)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /key-metrics/AAPL?limit=4&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of key metrics objects:

```json
[
  {
    "symbol": "AAPL",
    "date": "2023-09-30",
    "calendarYear": "2023",
    "period": "Q3",
    "revenuePerShare": 6.42,
    "netIncomePerShare": 1.46,
    "operatingCashFlowPerShare": 1.89,
    "freeCashFlowPerShare": 1.75,
    "cashPerShare": 4.69,
    "bookValuePerShare": 4.19,
    "tangibleBookValuePerShare": 3.95,
    "shareholdersEquityPerShare": 4.19,
    "interestDebtPerShare": 3.10,
    "marketCap": 2800000000000,
    "enterpriseValue": 2900000000000,
    "peRatio": 28.70,
    "priceToSalesRatio": 7.50,
    "pocfratio": 22.15,
    "pfcfRatio": 23.90,
    "pbRatio": 4.18,
    "ptbRatio": 4.18,
    "evToSales": 7.75,
    "enterpriseValueOverEBITDA": 22.50,
    "evToOperatingCashFlow": 22.90,
    "evToFreeCashFlow": 24.75,
    "earningsYield": 0.035,
    "freeCashFlowYield": 0.042,
    "debtToEquity": 1.73,
    "debtToAssets": 0.63,
    "netDebtToEBITDA": 1.25,
    "currentRatio": 1.05,
    "interestCoverage": 25.30,
    "incomeQuality": 1.29,
    "dividendYield": 0.0055,
    "payoutRatio": 0.15,
    "salesGeneralAndAdministrativeToRevenue": 0.065,
    "researchAndDevelopmentToRevenue": 0.073,
    "intangiblesToTotalAssets": 0.12,
    "capexToOperatingCashFlow": 0.074,
    "capexToRevenue": 0.047,
    "capexToDepreciation": 1.85,
    "stockBasedCompensationToRevenue": 0.012,
    "grahamNumber": 25.50,
    "roic": 0.58,
    "returnOnTangibleAssets": 0.42,
    "grahamNetNet": -15.20,
    "workingCapital": 5000000000,
    "tangibleAssetValue": 120000000000,
    "netCurrentAssetValue": -20000000000,
    "investedCapital": 150000000000,
    "averageReceivables": 30000000000,
    "averagePayables": 25000000000,
    "averageInventory": 5000000000,
    "daysSalesOutstanding": 25,
    "daysPayablesOutstanding": 85,
    "daysOfInventoryOnHand": 9,
    "receivablesTurnover": 14.6,
    "payablesTurnover": 4.3,
    "inventoryTurnover": 40.5,
    "roe": 1.72,
    "capexPerShare": 0.30
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 5. Income Statement Endpoint

**Path**: `/income-statement/{symbol}`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol in path (e.g., "AAPL")
- `limit` (number, optional): Number of periods to return (default: 4)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /income-statement/AAPL?limit=4&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of income statement objects:

```json
[
  {
    "symbol": "AAPL",
    "date": "2023-09-30",
    "calendarYear": "2023",
    "period": "Q3",
    "revenue": 89498000000,
    "costOfRevenue": 48345000000,
    "grossProfit": 41153000000,
    "grossProfitRatio": 0.459,
    "researchAndDevelopmentExpenses": 6532000000,
    "generalAndAdministrativeExpenses": 5822000000,
    "sellingAndMarketingExpenses": 0,
    "sellingGeneralAndAdministrativeExpenses": 5822000000,
    "otherExpenses": 0,
    "operatingExpenses": 12354000000,
    "costAndExpenses": 60700000000,
    "interestIncome": 2974000000,
    "interestExpense": 1003000000,
    "depreciationAndAmortization": 0,
    "ebitda": 30203000000,
    "ebitdaratio": 0.337,
    "operatingIncome": 28799000000,
    "operatingIncomeRatio": 0.322,
    "totalOtherIncomeExpensesNet": 0,
    "incomeBeforeTax": 28799000000,
    "incomeBeforeTaxRatio": 0.322,
    "incomeTaxExpense": 4562000000,
    "netIncome": 24237000000,
    "netIncomeRatio": 0.271,
    "eps": 1.46,
    "epsdiluted": 1.46,
    "weightedAverageShsOut": 15728700000,
    "weightedAverageShsOutDil": 15728700000
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 6. Ratios Endpoint

**Path**: `/ratios/{symbol}`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol in path (e.g., "AAPL")
- `limit` (number, optional): Number of periods to return (default: 3)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /ratios/AAPL?limit=3&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of ratio objects:

```json
[
  {
    "symbol": "AAPL",
    "date": "2023-09-30",
    "calendarYear": "2023",
    "period": "Q3",
    "currentRatio": 1.05,
    "quickRatio": 0.95,
    "cashRatio": 0.35,
    "daysOfSalesOutstanding": 25.5,
    "daysOfInventoryOutstanding": 9.2,
    "operatingCycle": 34.7,
    "daysOfPayablesOutstanding": 85.3,
    "cashCycle": -50.6,
    "grossProfitMargin": 0.459,
    "operatingProfitMargin": 0.322,
    "pretaxProfitMargin": 0.322,
    "netProfitMargin": 0.271,
    "effectiveTaxRate": 0.158,
    "returnOnAssets": 0.20,
    "returnOnEquity": 1.72,
    "returnOnCapitalEmployed": 0.58,
    "netIncomePerEBT": 0.842,
    "ebtPerEbit": 1.0,
    "ebitPerRevenue": 0.322,
    "debtRatio": 0.63,
    "debtEquityRatio": 1.73,
    "longTermDebtToCapitalization": 0.35,
    "totalDebtToCapitalization": 0.63,
    "interestCoverage": 25.30,
    "cashFlowToDebtRatio": 0.45,
    "companyEquityMultiplier": 5.2,
    "receivablesTurnover": 14.6,
    "payablesTurnover": 4.3,
    "inventoryTurnover": 40.5,
    "fixedAssetTurnover": 8.5,
    "assetTurnover": 1.2,
    "operatingCashFlowPerShare": 1.89,
    "freeCashFlowPerShare": 1.75,
    "cashPerShare": 4.69,
    "payoutRatio": 0.15,
    "operatingCashFlowSalesRatio": 0.35,
    "freeCashFlowOperatingCashFlowRatio": 0.93,
    "cashFlowCoverageRatios": 0.45,
    "shortTermCoverageRatios": 0.85,
    "capitalExpenditureCoverageRatio": 0.93,
    "dividendPaidAndCapexCoverageRatio": 0.88,
    "dividendPayoutRatio": 0.15,
    "priceBookValueRatio": 4.18,
    "priceToBookRatio": 4.18,
    "priceToSalesRatio": 7.50,
    "priceEarningsRatio": 28.70,
    "priceToFreeCashFlowsRatio": 23.90,
    "priceToOperatingCashFlowsRatio": 22.15,
    "priceCashFlowRatio": 22.15,
    "priceEarningsToGrowthRatio": 1.85,
    "priceSalesRatio": 7.50,
    "dividendYield": 0.0055,
    "enterpriseValueMultiple": 22.50,
    "priceFairValue": 185.20
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 7. Key Executives Endpoint

**Path**: `/key-executives`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol (e.g., "AAPL")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /key-executives?symbol=AAPL&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of executive objects:

```json
[
  {
    "symbol": "AAPL",
    "name": "Timothy D. Cook",
    "title": "Chief Executive Officer",
    "yearBorn": 1960,
    "fiscalYear": 2023,
    "exercisedValue": 0,
    "unexercisedValue": 0
  },
  {
    "symbol": "AAPL",
    "name": "Luca Maestri",
    "title": "Chief Financial Officer",
    "yearBorn": 1963,
    "fiscalYear": 2023,
    "exercisedValue": 0,
    "unexercisedValue": 0
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 8. Analyst Estimates Endpoint

**Path**: `/analyst-estimates`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol (e.g., "AAPL")
- `period` (string, optional): Period type - "annual" or "quarter" (default: "annual")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /analyst-estimates?symbol=AAPL&period=annual&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of analyst estimate objects:

```json
[
  {
    "symbol": "AAPL",
    "date": "2024-01-01",
    "estimatedRevenueLow": 380000000000,
    "estimatedRevenueHigh": 420000000000,
    "estimatedRevenueAvg": 400000000000,
    "estimatedEbitdaLow": 120000000000,
    "estimatedEbitdaHigh": 140000000000,
    "estimatedEbitdaAvg": 130000000000,
    "estimatedEbitLow": 110000000000,
    "estimatedEbitHigh": 130000000000,
    "estimatedEbitAvg": 120000000000,
    "estimatedNetIncomeLow": 95000000000,
    "estimatedNetIncomeHigh": 110000000000,
    "estimatedNetIncomeAvg": 102500000000,
    "estimatedSgaExpenseLow": 25000000000,
    "estimatedSgaExpenseHigh": 28000000000,
    "estimatedSgaExpenseAvg": 26500000000,
    "estimatedEpsAvg": 6.50,
    "estimatedEpsHigh": 7.00,
    "estimatedEpsLow": 6.00,
    "numberAnalystEstimatedRevenue": 45,
    "numberAnalystEstimatedEbitda": 40,
    "numberAnalystEstimatedEbit": 38,
    "numberAnalystEstimatedNetIncome": 42,
    "numberAnalystEstimatedSgaExpense": 30,
    "numberAnalystEstimatedEps": 48
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 9. Financial Growth Endpoint

**Path**: `/financial-growth`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol (e.g., "AAPL")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /financial-growth?symbol=AAPL&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of financial growth objects:

```json
[
  {
    "symbol": "AAPL",
    "date": "2023-09-30",
    "calendarYear": "2023",
    "period": "Q3",
    "revenueGrowth": 0.125,
    "costOfRevenueGrowth": 0.08,
    "operatingIncomeGrowth": 0.15,
    "netIncomeGrowth": 0.083,
    "shareholdersEquityGrowth": 0.12,
    "operatingCashFlowGrowth": 0.18,
    "freeCashFlowGrowth": 0.20,
    "tenYRevenueGrowthPerShare": 0.15,
    "threeYRevenueGrowthPerShare": 0.12,
    "fiveYRevenueGrowthPerShare": 0.14,
    "tenYOperatingCFGrowthPerShare": 0.16,
    "threeYOperatingCFGrowthPerShare": 0.13,
    "fiveYOperatingCFGrowthPerShare": 0.15,
    "tenYNetIncomeGrowthPerShare": 0.18,
    "threeYNetIncomeGrowthPerShare": 0.15,
    "fiveYNetIncomeGrowthPerShare": 0.17,
    "tenYShareholdersEquityGrowthPerShare": 0.14,
    "threeYShareholdersEquityGrowthPerShare": 0.11,
    "fiveYShareholdersEquityGrowthPerShare": 0.13,
    "tenYDividendPerShareGrowthPerShare": 0.10,
    "threeYDividendPerShareGrowthPerShare": 0.08,
    "fiveYDividendPerShareGrowthPerShare": 0.09,
    "receivablesGrowth": 0.05,
    "inventoryGrowth": 0.03,
    "assetGrowth": 0.10,
    "bookValuePerShareGrowth": 0.12,
    "debtGrowth": 0.08,
    "rdexpenseGrowth": 0.15,
    "sgaexpensesGrowth": 0.10
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 10. Discounted Cash Flow (DCF) Endpoint

**Path**: `/discounted-cash-flow`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol (e.g., "AAPL")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /discounted-cash-flow?symbol=AAPL&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of DCF objects (typically one item):

```json
[
  {
    "symbol": "AAPL",
    "date": "2024-01-15",
    "dcf": 185.20,
    "stockPrice": 175.43
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 11. Financial Scores Endpoint

**Path**: `/financial-scores`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol (e.g., "AAPL")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /financial-scores?symbol=AAPL&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of financial score objects (typically one item):

```json
[
  {
    "symbol": "AAPL",
    "altmanZScore": 4.2,
    "piotroskiScore": 8,
    "workingCapital": 5000000000,
    "totalAssets": 350000000000,
    "retainedEarnings": 150000000000,
    "ebit": 120000000000,
    "marketCap": 2800000000000,
    "totalLiabilities": 220000000000,
    "revenue": 394328000000
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 12. Market Status Endpoint

**Path**: `/is-the-market-open`  
**Method**: `GET`

### Request Schema
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /is-the-market-open?apikey=YOUR_API_KEY
```

### Response Schema
```json
{
  "isTheStockMarketOpen": true
}
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 13. Social Sentiment Trending Endpoint

**Path**: `/social-sentiment/trending`  
**Method**: `GET`

### Request Schema
- `type` (string, required): Sentiment type - "bullish" or "bearish"
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /social-sentiment/trending?type=bullish&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of stock items with social sentiment:

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 175.43,
    "changesPercentage": 1.35,
    "change": 2.34,
    "dayLow": 172.50,
    "dayHigh": 176.10,
    "yearHigh": 198.23,
    "yearLow": 164.08,
    "marketCap": 2800000000000,
    "priceAvg50": 180.25,
    "priceAvg200": 175.10,
    "volume": 50000000,
    "avgVolume": 45000000,
    "exchange": "NASDAQ",
    "open": 173.20,
    "previousClose": 173.09,
    "eps": 6.11,
    "pe": 28.70,
    "earningsAnnouncement": "2024-01-25T16:30:00.000+0000",
    "sharesOutstanding": 15728700000,
    "timestamp": 1704067200
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 14. Crypto Quotes Endpoint

**Path**: `/quotes/crypto`  
**Method**: `GET`

### Request Schema
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /quotes/crypto?apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of crypto quote objects:

```json
[
  {
    "symbol": "BTCUSD",
    "name": "Bitcoin",
    "price": 45000.00,
    "changesPercentage": 2.5,
    "change": 1100.00,
    "dayLow": 43800.00,
    "dayHigh": 45200.00,
    "yearHigh": 69000.00,
    "yearLow": 16000.00,
    "marketCap": 850000000000,
    "priceAvg50": 42000.00,
    "priceAvg200": 38000.00,
    "volume": 25000000000,
    "avgVolume": 20000000000,
    "exchange": "Binance",
    "open": 43900.00,
    "previousClose": 43900.00,
    "eps": null,
    "pe": null,
    "earningsAnnouncement": null,
    "sharesOutstanding": null,
    "timestamp": 1704067200
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 15. Earnings Calendar Endpoint

**Path**: `/earning_calendar`  
**Method**: `GET`

### Request Schema
- `from` (string, optional): Start date in YYYY-MM-DD format
- `to` (string, optional): End date in YYYY-MM-DD format
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /earning_calendar?from=2024-01-01&to=2024-01-31&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of earnings calendar events:

```json
[
  {
    "symbol": "AAPL",
    "date": "2024-01-25",
    "eps": 2.18,
    "epsEstimated": 2.10,
    "revenue": 119575000000,
    "revenueEstimated": 117900000000,
    "time": "AMC",
    "updatedFromDate": "2024-01-15"
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 16. Stock Dividend Calendar Endpoint

**Path**: `/stock_dividend_calendar`  
**Method**: `GET`

### Request Schema
- `from` (string, optional): Start date in YYYY-MM-DD format
- `to` (string, optional): End date in YYYY-MM-DD format
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /stock_dividend_calendar?from=2024-01-01&to=2024-01-31&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of dividend calendar events:

```json
[
  {
    "symbol": "AAPL",
    "date": "2024-02-15",
    "label": "February 15, 2024",
    "adjDividend": 0.24,
    "dividend": 0.24,
    "recordDate": "2024-02-12",
    "paymentDate": "2024-02-15",
    "declarationDate": "2024-01-25"
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 17. IPO Calendar Endpoint

**Path**: `/ipo_calendar`  
**Method**: `GET`

### Request Schema
- `from` (string, optional): Start date in YYYY-MM-DD format
- `to` (string, optional): End date in YYYY-MM-DD format
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /ipo_calendar?from=2024-01-01&to=2024-01-31&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of IPO calendar events:

```json
[
  {
    "symbol": "NEWCO",
    "name": "New Company Inc.",
    "ipoDate": "2024-01-15",
    "priceRangeLow": 20.00,
    "priceRangeHigh": 22.00,
    "currency": "USD",
    "exchange": "NASDAQ"
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 18. Stock Split Calendar Endpoint

**Path**: `/stock_split_calendar`  
**Method**: `GET`

### Request Schema
- `from` (string, optional): Start date in YYYY-MM-DD format
- `to` (string, optional): End date in YYYY-MM-DD format
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /stock_split_calendar?from=2024-01-01&to=2024-01-31&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of stock split calendar events:

```json
[
  {
    "symbol": "AAPL",
    "date": "2024-06-07",
    "label": "June 7, 2024",
    "numerator": 4,
    "denominator": 1
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 19. Stock News Endpoint

**Path**: `/stock_news`  
**Method**: `GET`

### Request Schema
- `tickers` (string, required): Comma-separated stock symbols (e.g., "AAPL,MSFT")
- `limit` (number, optional): Maximum number of results (default: 6)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /stock_news?tickers=AAPL&limit=6&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of news items:

```json
[
  {
    "symbol": "AAPL",
    "publishedDate": "2024-01-15 10:30:00",
    "title": "Apple Reports Record Q4 Earnings",
    "text": "Apple Inc. announced record-breaking earnings...",
    "url": "https://example.com/news/apple-earnings",
    "image": "https://example.com/images/apple-news.jpg",
    "site": "Reuters",
    "type": "news"
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 20. News Stock Endpoint

**Path**: `/news/stock`  
**Method**: `GET`

### Request Schema
- `symbols` (string, required): Comma-separated stock symbols (e.g., "AAPL,MSFT")
- `from` (string, optional): Start date in YYYY-MM-DD format
- `to` (string, optional): End date in YYYY-MM-DD format
- `page` (number, optional): Page number for pagination (default: 0)
- `limit` (number, optional): Maximum number of results per page (default: 20, max: 250)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /news/stock?symbols=AAPL,MSFT&limit=20&page=0&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of news items:

```json
[
  {
    "symbol": "AAPL",
    "publishedDate": "2024-01-15 10:30:00",
    "title": "Apple Reports Record Q4 Earnings",
    "text": "Apple Inc. announced record-breaking earnings...",
    "url": "https://example.com/news/apple-earnings",
    "image": "https://example.com/images/apple-news.jpg",
    "site": "Reuters",
    "type": "news"
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 21. General Latest News Endpoint

**Path**: `/news/general-latest`  
**Method**: `GET`

### Request Schema
- `page` (number, optional): Page number for pagination (default: 0)
- `limit` (number, optional): Maximum number of results per page (default: 20, max: 250)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /news/general-latest?limit=20&page=0&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of general news items:

```json
[
  {
    "symbol": null,
    "publishedDate": "2024-01-15 10:30:00",
    "title": "Market Opens Higher on Economic Data",
    "text": "Stock markets opened higher today following...",
    "url": "https://example.com/news/market-update",
    "image": "https://example.com/images/market-news.jpg",
    "site": "Bloomberg",
    "type": "news"
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 22. Search Name Endpoint

**Path**: `/search-name`  
**Method**: `GET`

### Request Schema
- `query` (string, required): Company name search query
- `limit` (number, optional): Maximum number of results (default: 20)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /search-name?query=Apple&limit=20&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of search results:

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "currency": "USD",
    "stockExchange": "NASDAQ"
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 23. Search Symbol Endpoint

**Path**: `/search-symbol`  
**Method**: `GET`

### Request Schema
- `query` (string, required): Symbol search query
- `limit` (number, optional): Maximum number of results (default: 20)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /search-symbol?query=AAPL&limit=20&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of search results:

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "currency": "USD",
    "stockExchange": "NASDAQ"
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 24. Stock Market Gainers Endpoint

**Path**: `/v3/stock_market/gainers`  
**Method**: `GET`

### Request Schema
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /v3/stock_market/gainers?apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of stock items:

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 175.43,
    "changesPercentage": 1.35,
    "change": 2.34,
    "dayLow": 172.50,
    "dayHigh": 176.10,
    "yearHigh": 198.23,
    "yearLow": 164.08,
    "marketCap": 2800000000000,
    "priceAvg50": 180.25,
    "priceAvg200": 175.10,
    "volume": 50000000,
    "avgVolume": 45000000,
    "exchange": "NASDAQ",
    "open": 173.20,
    "previousClose": 173.09,
    "eps": 6.11,
    "pe": 28.70,
    "earningsAnnouncement": "2024-01-25T16:30:00.000+0000",
    "sharesOutstanding": 15728700000,
    "timestamp": 1704067200
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 25. Stock Market Losers Endpoint

**Path**: `/v3/stock_market/losers`  
**Method**: `GET`

### Request Schema
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /v3/stock_market/losers?apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of stock items (same structure as gainers):

```json
[
  {
    "symbol": "XYZ",
    "name": "XYZ Corp.",
    "price": 50.00,
    "changesPercentage": -5.25,
    "change": -2.75,
    "dayLow": 49.50,
    "dayHigh": 52.80,
    "yearHigh": 65.00,
    "yearLow": 45.00,
    "marketCap": 5000000000,
    "priceAvg50": 55.00,
    "priceAvg200": 58.00,
    "volume": 10000000,
    "avgVolume": 8000000,
    "exchange": "NYSE",
    "open": 52.50,
    "previousClose": 52.75,
    "eps": 2.50,
    "pe": 20.00,
    "earningsAnnouncement": "2024-02-15T16:30:00.000+0000",
    "sharesOutstanding": 100000000,
    "timestamp": 1704067200
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 26. Stock Market Actives Endpoint

**Path**: `/v3/stock_market/actives`  
**Method**: `GET`

### Request Schema
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /v3/stock_market/actives?apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of stock items (same structure as gainers/losers):

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 175.43,
    "changesPercentage": 1.35,
    "change": 2.34,
    "dayLow": 172.50,
    "dayHigh": 176.10,
    "yearHigh": 198.23,
    "yearLow": 164.08,
    "marketCap": 2800000000000,
    "priceAvg50": 180.25,
    "priceAvg200": 175.10,
    "volume": 50000000,
    "avgVolume": 45000000,
    "exchange": "NASDAQ",
    "open": 173.20,
    "previousClose": 173.09,
    "eps": 6.11,
    "pe": 28.70,
    "earningsAnnouncement": "2024-01-25T16:30:00.000+0000",
    "sharesOutstanding": 15728700000,
    "timestamp": 1704067200
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 27. Stock Screener Endpoint

**Path**: `/v3/stock-screener`  
**Method**: `GET`

### Request Schema
- `marketCapMoreThan` (number, optional): Minimum market cap in dollars (default: 1000000000)
- `peLowerThan` (number, optional): Maximum P/E ratio (default: 20)
- `dividendMoreThan` (number, optional): Minimum dividend yield percentage (default: 2)
- `limit` (number, optional): Maximum number of results (default: 50, max: 50)
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /v3/stock-screener?marketCapMoreThan=1000000000&peLowerThan=20&dividendMoreThan=2&limit=50&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of stock items matching the screener criteria:

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 175.43,
    "changesPercentage": 1.35,
    "change": 2.34,
    "dayLow": 172.50,
    "dayHigh": 176.10,
    "yearHigh": 198.23,
    "yearLow": 164.08,
    "marketCap": 2800000000000,
    "priceAvg50": 180.25,
    "priceAvg200": 175.10,
    "volume": 50000000,
    "avgVolume": 45000000,
    "exchange": "NASDAQ",
    "open": 173.20,
    "previousClose": 173.09,
    "eps": 6.11,
    "pe": 28.70,
    "earningsAnnouncement": "2024-01-25T16:30:00.000+0000",
    "sharesOutstanding": 15728700000,
    "timestamp": 1704067200
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 28. Sectors Performance Endpoint

**Path**: `/v3/sectors-performance`  
**Method**: `GET`

### Request Schema
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /v3/sectors-performance?apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of sector performance objects:

```json
[
  {
    "sector": "Technology",
    "changesPercentage": 2.5
  },
  {
    "sector": "Healthcare",
    "changesPercentage": 1.8
  },
  {
    "sector": "Financial Services",
    "changesPercentage": -0.5
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 29. Historical Price Full Stock Dividend Endpoint

**Path**: `/v3/historical-price-full/stock_dividend/{symbol}`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol in path (e.g., "AAPL")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /v3/historical-price-full/stock_dividend/AAPL?apikey=YOUR_API_KEY
```

### Response Schema
```json
{
  "symbol": "AAPL",
  "historical": [
    {
      "date": "2023-11-16",
      "label": "November 16, 2023",
      "adjDividend": 0.24,
      "dividend": 0.24
    },
    {
      "date": "2023-08-11",
      "label": "August 11, 2023",
      "adjDividend": 0.24,
      "dividend": 0.24
    }
  ]
}
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 30. Profile V3 Endpoint

**Path**: `/v3/profile/{symbol}`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol in path (e.g., "AAPL")
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /v3/profile/AAPL?apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of profile objects (typically one item):

```json
[
  {
    "symbol": "AAPL",
    "companyName": "Apple Inc.",
    "name": "Apple Inc.",
    "industry": "Consumer Electronics",
    "sector": "Technology",
    "description": "Apple Inc. designs, manufactures, and markets...",
    "website": "https://www.apple.com",
    "image": "https://images.financialmodelingprep.com/symbol/AAPL.png",
    "beta": 1.25,
    "lastDiv": 0.24,
    "dividendYield": 0.55,
    "price": 175.43
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## 31. Historical Chart 30min Endpoint

**Path**: `/historical-chart/30min`  
**Method**: `GET`

### Request Schema
- `symbol` (string, required): Stock symbol (e.g., "AAPL")
- `from` (string, required): Start date in YYYY-MM-DD format
- `to` (string, required): End date in YYYY-MM-DD format
- `apikey` (string, required): API key for authentication

**Example Request**:
```
GET /historical-chart/30min?symbol=AAPL&from=2024-01-01&to=2024-01-15&apikey=YOUR_API_KEY
```

### Response Schema
Returns an array of 30-minute OHLC candle objects:

```json
[
  {
    "date": "2024-01-15 09:30:00",
    "open": 173.20,
    "high": 173.80,
    "low": 173.10,
    "close": 173.50,
    "volume": 5000000
  },
  {
    "date": "2024-01-15 10:00:00",
    "open": 173.50,
    "high": 174.00,
    "low": 173.40,
    "close": 173.90,
    "volume": 4500000
  }
]
```

### Error Response Schema
```json
{
  "Error Message": "Invalid API Key"
}
```

---

## Common Error Responses

All endpoints may return the following error responses:

### Invalid API Key
```json
{
  "Error Message": "Invalid API Key"
}
```

### Rate Limit Exceeded
HTTP Status: 429
```json
{
  "Error Message": "Rate limit exceeded"
}
```

### Invalid Symbol
```json
{
  "Error Message": "Invalid symbol"
}
```

### Missing Required Parameter
```json
{
  "Error Message": "Missing required parameter: symbol"
}
```

---

## Notes

1. **Authentication**: All endpoints require the `apikey` query parameter. The API key should be included in every request.

2. **Response Format**: Most endpoints return arrays, even for single-item responses. Always check if the response is an array and handle accordingly.

3. **Date Formats**: 
   - Dates in query parameters: `YYYY-MM-DD` (e.g., "2024-01-15")
   - Dates in responses: `YYYY-MM-DD` or ISO 8601 format with timestamps

4. **Symbol Format**: Stock symbols should be uppercase (e.g., "AAPL" not "aapl"). The API may accept lowercase but returns uppercase.

5. **Rate Limits**: The FMP API has rate limits. Implement retry logic with exponential backoff for 429 responses.

6. **Empty Responses**: Some endpoints may return empty arrays `[]` when no data is available. This is a valid response, not an error.

7. **Null Values**: Some fields may be `null` in responses. Handle null values appropriately in your implementation.

8. **Pagination**: News endpoints support pagination with `page` and `limit` parameters. The maximum `limit` is typically 250.

9. **Batch Requests**: The quote endpoint supports comma-separated symbols for batch requests (e.g., `symbol=AAPL,MSFT,GOOGL`).

10. **Historical Data**: Historical endpoints may return large datasets. Consider implementing pagination or date range limits for performance.
