# Stockly API Documentation

Complete API reference for the Stockly backend service.

**Base URL:** `https://stockly-api.ahmednasser1993.workers.dev`  
**Version:** 1.0.0  
**Last Updated:** November 19, 2025

All endpoints support CORS and return JSON responses.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Health Check](#health-check)
3. [Stock Endpoints](#stock-endpoints)
   - [Get Single Stock](#get-single-stock)
   - [Get Multiple Stocks](#get-multiple-stocks)
   - [Get Stock Details](#get-stock-details)
   - [Get Stock News](#get-stock-news)
   - [Search Stocks](#search-stocks)
   - [Get Historical Prices](#get-historical-prices)
4. [Price Alerts](#price-alerts)
   - [List Alerts](#list-alerts)
   - [Create Alert](#create-alert)
   - [Get Alert](#get-alert)
   - [Update Alert](#update-alert)
   - [Delete Alert](#delete-alert)
5. [Push Notifications](#push-notifications)
   - [Register Push Token](#register-push-token)
   - [Get Push Token](#get-push-token)
6. [User Preferences](#user-preferences)
7. [User Settings](#user-settings)
8. [Admin Endpoints](#admin-endpoints)
   - [Configuration](#configuration)
   - [Notifications](#notifications)
   - [Devices](#devices)
9. [Error Codes](#error-codes)
10. [Rate Limits](#rate-limits)
11. [Data Types](#data-types)
12. [Cron Jobs](#cron-jobs)

---

## Authentication

Currently, no authentication is required. CORS is enabled for all origins.

**CORS Headers:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## Health Check

### GET `/v1/api/health`

Check API health status.

**Response:**
```json
{
  "status": "ok"
}
```

**Example:**
```bash
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/health
```

---

## Stock Endpoints

### Get Single Stock

#### GET `/v1/api/get-stock`

Fetches real-time quote for a single stock symbol with complete data including image, description, change percentage, and all market data.

**Query Parameters:**
- `symbol` (required): Stock ticker symbol (e.g., `AAPL`, `MSFT`, `GOOGL`)

**Response Fields:**
- `symbol` (string): Stock ticker symbol
- `name` (string): Company name
- `price` (number): Current stock price
- `change` (number): Price change from previous close
- `changePercentage` (number): Percentage change from previous close
- `volume` (integer): Trading volume
- `dayLow` (number): Lowest price of the day
- `dayHigh` (number): Highest price of the day
- `yearLow` (number): Lowest price in the past year
- `yearHigh` (number): Highest price in the past year
- `marketCap` (integer): Market capitalization
- `exchange` (string): Stock exchange (e.g., `NASDAQ`, `NYSE`)
- `image` (string | null): Company logo image URL
- `description` (string | null): Company description
- `stale` (boolean | null): Indicates if data is stale (simulation or provider failure)
- `stale_reason` (string | null): Reason for stale data
- `lastUpdatedAt` (string | null): ISO timestamp of last update

**Example Request:**
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock?symbol=AAPL"
```

**Example Response:**
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "price": 195.50,
  "change": 2.50,
  "changePercentage": 1.30,
  "volume": 50000000,
  "dayLow": 193.00,
  "dayHigh": 196.00,
  "yearLow": 150.00,
  "yearHigh": 200.00,
  "marketCap": 3000000000000,
  "exchange": "NASDAQ",
  "image": "https://images.financialmodelingprep.com/symbol/AAPL.png",
  "description": "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide."
}
```

**Error Responses:**
- `400`: Missing `symbol` parameter
- `404`: Symbol not found
- `500`: Server error

**Caching:** Results cached based on `pollingIntervalSec` configuration (default: 30 seconds)

---

### Get Multiple Stocks

#### GET `/v1/api/get-stocks`

Fetches quotes for multiple stock symbols in a single request. Returns an array of stock objects with complete data including image, description, change percentage, and all market data.

**Query Parameters:**
- `symbols` (required): Comma-separated list of stock symbols (e.g., `AAPL,MSFT,GOOGL`)

**Response:**
Array of stock objects, each containing the same fields as the single stock endpoint.

**Example Request:**
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stocks?symbols=AAPL,MSFT,GOOGL"
```

**Example Response:**
```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 195.50,
    "change": 2.50,
    "changePercentage": 1.30,
    "volume": 50000000,
    "dayLow": 193.00,
    "dayHigh": 196.00,
    "yearLow": 150.00,
    "yearHigh": 200.00,
    "marketCap": 3000000000000,
    "exchange": "NASDAQ",
    "image": "https://images.financialmodelingprep.com/symbol/AAPL.png",
    "description": "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide."
  },
  {
    "symbol": "MSFT",
    "name": "Microsoft Corporation",
    "price": 420.75,
    "change": -5.25,
    "changePercentage": -1.23,
    "volume": 25000000,
    "dayLow": 418.00,
    "dayHigh": 425.00,
    "yearLow": 300.00,
    "yearHigh": 450.00,
    "marketCap": 3100000000000,
    "exchange": "NASDAQ",
    "image": "https://images.financialmodelingprep.com/symbol/MSFT.png",
    "description": "Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide."
  }
]
```

**Notes:**
- Symbols are automatically normalized (uppercase, trimmed)
- Duplicate symbols are deduplicated
- Failed symbol fetches are gracefully handled (only successful fetches are returned)
- Each stock includes complete data: `symbol`, `name`, `price`, `change`, `changePercentage`, `image`, `description`, and all market data
- If profile data is unavailable, a default image URL is constructed from the symbol

**Error Responses:**
- `400`: Missing `symbols` parameter or empty symbol list
- `500`: Server error (all symbols failed to fetch)

**Caching:** Per-symbol cache based on `pollingIntervalSec` configuration

---

### Get Stock Details

#### GET `/v1/api/get-stock-details`

Fetches comprehensive stock information including profile, quote, historical chart data, financials, news, and more. Aggregates data from multiple FMP endpoints into a unified response.

**Query Parameters:**
- `symbol` (required): Stock ticker symbol (e.g., `AAPL`, `AMZN`)

**Response:**
```json
{
  "symbol": "AMZN",
  "profile": {
    "companyName": "Amazon.com Inc.",
    "industry": "E-Commerce",
    "sector": "Consumer Cyclical",
    "description": "Amazon.com Inc. is a multinational technology company...",
    "website": "https://www.amazon.com",
    "image": "https://images.financialmodelingprep.com/symbol/AMZN.png"
  },
  "quote": {
    "price": 150.25,
    "change": 2.5,
    "changesPercentage": 1.69,
    "dayHigh": 152.0,
    "dayLow": 148.5,
    "open": 149.0,
    "previousClose": 147.75,
    "volume": 50000000,
    "marketCap": 1500000000000
  },
  "chart": {
    "1D": [{ "date": "2024-01-20", "price": 150.25, "volume": 50000000 }],
    "1W": [{ "date": "2024-01-15", "price": 148.0, "volume": 48000000 }],
    "1M": [],
    "3M": [],
    "1Y": [],
    "ALL": []
  },
  "financials": {
    "income": [
      {
        "date": "2024-01-01",
        "revenue": 1000000,
        "netIncome": 200000,
        "eps": 5.5
      }
    ],
    "keyMetrics": [
      {
        "date": "2024-01-01",
        "peRatio": 25,
        "priceToBook": 5
      }
    ],
    "ratios": [
      {
        "date": "2024-01-01",
        "currentRatio": 2.5,
        "debtToEquity": 1.2
      }
    ]
  },
  "news": [
    {
      "title": "Amazon Announces New Service",
      "text": "Amazon has announced a new service...",
      "url": "https://example.com/news",
      "publishedDate": "2024-01-20",
      "image": "https://example.com/image.jpg"
    }
  ],
  "peers": [],
  "partial": false,
  "cached": false,
  "refreshedAt": 1705780800000
}
```

**Example Request:**
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock-details?symbol=AMZN"
```

**Error Responses:**
- `400`: Missing `symbol` parameter or invalid symbol format
- `500`: Server error

**Caching:** Results cached based on `pollingIntervalSec` configuration

**Notes:**
- Returns partial data if some endpoints fail (indicated by `partial: true`)
- Chart data is filtered by time periods (1D, 1W, 1M, 3M, 1Y, ALL)
- Financials include income statements, key metrics, and ratios
- News articles are limited to the latest available

---

### Get Stock News

#### GET `/v1/api/get-news`

Fetches latest news articles for one or multiple stock symbols from FMP API. Supports both single symbol and comma-separated multiple symbols. Includes pagination support for date filtering and result limiting. Results are cached based on polling interval configuration.

**Query Parameters:**
- `symbol` (optional): Single stock ticker symbol (e.g., `AAPL`)
- `symbols` (optional): Comma-separated list of stock ticker symbols (e.g., `AAPL,MSFT,GOOGL`)
- `from` (optional): Start date for news filtering in `YYYY-MM-DD` format (e.g., `2025-01-01`)
- `to` (optional): End date for news filtering in `YYYY-MM-DD` format (e.g., `2025-01-31`)
- `page` (optional): Page number (0-based). Default: `0`
- `limit` (optional): Number of results per page (1-250). Default: `20`. Maximum: `250`
- **Note:** Either `symbol` or `symbols` parameter is required (not both)
- **Note:** `from` date must be before or equal to `to` date if both provided

**Response:**
```json
{
  "symbols": ["AAPL"],
  "news": [
    {
      "title": "Apple Announces New iPhone",
      "text": "Apple has announced a new iPhone model...",
      "url": "https://example.com/news",
      "publishedDate": "2024-01-20T10:00:00Z",
      "image": "https://example.com/image.jpg",
      "site": "TechCrunch",
      "type": "news"
    },
    {
      "title": "Apple Stock Rises",
      "text": "Apple stock has risen following...",
      "url": "https://example.com/news2",
      "publishedDate": "2024-01-19T15:00:00Z",
      "site": "Reuters",
      "type": "news"
    }
  ],
  "pagination": {
    "page": 0,
    "limit": 20,
    "total": 20,
    "hasMore": true
  },
  "cached": false
}
```

**Example Requests:**

Single symbol:
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL"
```

Multiple symbols:
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbols=AAPL,MSFT,GOOGL"
```

With pagination (date range + page + limit):
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL&from=2025-01-01&to=2025-01-31&page=0&limit=20"
```

With pagination only (limit results):
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL&page=0&limit=10"
```

**Response Fields:**
- `symbols` (array): Array of stock ticker symbols requested
- `news` (array): Array of news articles (combined from all requested symbols)
  - `title` (string): News article title
  - `text` (string): News article text/description
  - `url` (string): News article URL
  - `publishedDate` (string): Publication date (ISO format)
  - `image` (string | null): News article image URL
  - `site` (string): News source/site name
  - `type` (string): Type of content (typically "news")
- `pagination` (object): Pagination metadata
  - `page` (number): Current page number (0-based)
  - `limit` (number): Number of results per page
  - `total` (number): Total number of news articles returned in this response
  - `hasMore` (boolean): Whether there are more pages available (estimated)
- `cached` (boolean): Whether the response was served from cache
- `partial` (boolean, optional): `true` if API fetch failed but empty array returned gracefully
- `error` (string, optional): Error message if fetch failed (still returns 200 status)

**Error Responses:**
- `400`: Missing `symbol` or `symbols` parameter, invalid symbol format, invalid date format, invalid pagination parameters, or more than 10 symbols
  - Examples:
    - `"symbol or symbols parameter required"`
    - `"invalid 'from' date format (expected YYYY-MM-DD)"`
    - `"invalid 'page' parameter (must be non-negative integer)"`
    - `"invalid 'limit' parameter (must be 1-250)"`
    - `"'from' date must be before or equal to 'to' date"`
- `200` with `error` field: Provider failure (graceful degradation - returns empty news array)

**Caching:** 
- Results are cached based on `pollingIntervalSec` configuration (same as other stock endpoints)
- Caching is only enabled when no pagination parameters are used (to avoid cache bloat)
- When pagination parameters (`from`, `to`, `page`, `limit`) are provided, results are always fetched fresh

**Notes:**
- Supports both single symbol (`?symbol=AAPL`) and multiple symbols (`?symbols=AAPL,MSFT`)
- Maximum 10 symbols per request
- Maximum 250 results per page (`limit` parameter)
- Date filtering: Use `from` and `to` parameters to filter news by publication date (YYYY-MM-DD format)
- Pagination: Use `page` (0-based) and `limit` (1-250) to control results per page
- Returns empty array if news is unavailable or API fails (graceful degradation)
- News articles from multiple symbols are combined into a single array
- Cache key is based on sorted symbols (and pagination params if provided) for consistency
- Follows same caching pattern as `/v1/api/get-stocks`
- Respects `simulateProviderFailure` feature flag (returns empty array in simulation mode)
- News articles are sorted by date (newest first)

---

### Search Stocks

#### GET `/v1/api/search-stock`

Searches for matching ticker symbols and company names.

**Query Parameters:**
- `query` (required): Partial symbol or company name (minimum 2 characters)

**Response:**
Array of matching stock objects with:
- `symbol` (string): Stock ticker symbol
- `name` (string): Company name
- `currency` (string): Currency code
- `stockExchange` (string): Stock exchange name

**Example Request:**
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/search-stock?query=apple"
```

**Example Response:**
```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "currency": "USD",
    "stockExchange": "NASDAQ"
  },
  {
    "symbol": "APTV",
    "name": "Aptiv PLC",
    "currency": "USD",
    "stockExchange": "NYSE"
  }
]
```

**Error Responses:**
- `200` with empty array: No matches found or query too short

**Caching:** Results cached in D1 for 20 minutes

---

### Get Historical Prices

#### GET `/v1/api/get-historical`

Retrieves historical price data for a stock symbol from the database.

**Query Parameters:**
- `symbol` (required): Stock ticker symbol
- `days` (optional): Number of days to look back (default: 180, max: 3650)

**Response:**
```json
{
  "symbol": "AAPL",
  "days": 180,
  "data": [
    {
      "date": "2025-01-01",
      "price": 195.50,
      "volume": 50000000
    },
    {
      "date": "2025-01-02",
      "price": 196.00,
      "volume": 52000000
    }
  ]
}
```

**Example Request:**
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-historical?symbol=AAPL&days=30"
```

**Error Responses:**
- `400`: Missing `symbol` or invalid `days` parameter
- `500`: Server error

---

## Price Alerts

### List Alerts

#### GET `/v1/api/alerts`

Retrieves all price alerts.

**Response:**
```json
{
  "alerts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "symbol": "AAPL",
      "direction": "above",
      "threshold": 200.50,
      "status": "active",
      "channel": "notification",
      "target": "fcm-token-here",
      "notes": "Watch for breakout",
      "createdAt": "2025-11-14T10:30:00.000Z",
      "updatedAt": "2025-11-14T10:30:00.000Z"
    }
  ]
}
```

---

### Create Alert

#### POST `/v1/api/alerts`

Creates a new price alert.

**Request Body:**
```json
{
  "symbol": "AAPL",
  "direction": "above",
  "threshold": 200.50,
  "channel": "notification",
  "target": "fcm-token-here",
  "notes": "Optional note"
}
```

**Field Validations:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `symbol` | string | Yes | Auto-uppercased, min 1 char |
| `direction` | enum | Yes | Must be `"above"` or `"below"` |
| `threshold` | number | Yes | Must be positive |
| `channel` | enum | Yes | Must be `"notification"` |
| `target` | string | Yes | FCM Push Token |
| `notes` | string | No | Optional user note |

**Success Response (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "symbol": "AAPL",
  "direction": "above",
  "threshold": 200.50,
  "status": "active",
  "channel": "notification",
  "target": "fcm-token-here",
  "notes": "Optional note",
  "createdAt": "2025-11-14T10:30:00.000Z",
  "updatedAt": "2025-11-14T10:30:00.000Z"
}
```

**Error Response (400):**
```json
{
  "error": "threshold must be a positive number"
}
```

---

### Get Alert

#### GET `/v1/api/alerts/:id`

Retrieves a specific alert by UUID.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Alert UUID |

**Example Request:**
```bash
GET /v1/api/alerts/550e8400-e29b-41d4-a716-446655440000
```

**Success Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "symbol": "AAPL",
  "direction": "above",
  "threshold": 200.50,
  "status": "active",
  "channel": "notification",
  "target": "fcm-token-here",
  "notes": "Watch for breakout",
  "createdAt": "2025-11-14T10:30:00.000Z",
  "updatedAt": "2025-11-14T10:30:00.000Z"
}
```

**Error Response (404):**
```json
{
  "error": "alert not found"
}
```

---

### Update Alert

#### PUT `/v1/api/alerts/:id`

Updates an existing alert (partial updates supported).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Alert UUID |

**Request Body (all fields optional):**
```json
{
  "symbol": "MSFT",
  "direction": "below",
  "threshold": 150.00,
  "status": "paused",
  "channel": "notification",
  "target": "fcm-token-here",
  "notes": "Updated note"
}
```

**Success Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "symbol": "MSFT",
  "threshold": 150.00,
  "status": "paused",
  ...
}
```

**Error Responses:**
- `400` - Validation error or no fields provided
- `404` - Alert not found

---

### Delete Alert

#### DELETE `/v1/api/alerts/:id`

Deletes an alert and its KV state.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Alert UUID |

**Example Request:**
```bash
DELETE /v1/api/alerts/550e8400-e29b-41d4-a716-446655440000
```

**Success Response (200):**
```json
{
  "success": true
}
```

**Error Response (404):**
```json
{
  "error": "alert not found"
}
```

---

## Push Notifications

### Register Push Token

#### POST `/v1/api/push-token`

Registers or updates a user's push notification token (FCM).

**Request Body:**
```json
{
  "userId": "user-123",
  "token": "fcm-token-here",
  "deviceInfo": "iPhone 14 Pro"
}
```

**Fields:**
- `userId` (required): User identifier
- `token` (required): FCM push token (minimum 20 characters)
- `deviceInfo` (optional): Device information

**Response:** `200 OK` (updated) or `201 Created` (new)
```json
{
  "success": true,
  "message": "Push token registered",
  "userId": "user-123"
}
```

**Error Responses:**
- `400`: Invalid token format or missing required fields
- `500`: Server error

**Validation:**
- Old Expo tokens (`ExponentPushToken[...]`) are rejected with error
- Token must be FCM token format

---

### Get Push Token

#### GET `/v1/api/push-token/:userId`

Retrieves a user's push token.

**Response:** `200 OK`
```json
{
  "userId": "user-123",
  "pushToken": "fcm-token-here",
  "deviceInfo": "iPhone 14 Pro",
  "createdAt": "2025-11-15T16:36:43.118Z",
  "updatedAt": "2025-11-19T17:17:44.558Z"
}
```

**Error Responses:**
- `404`: Token not found

---

## User Preferences

### Get Preferences

#### GET `/v1/api/preferences/:userId`

Retrieves user preferences.

**Response:** `200 OK`
```json
{
  "userId": "user-123",
  "enabled": true,
  "quietStart": "22:00",
  "quietEnd": "08:00",
  "allowedSymbols": ["AAPL", "MSFT"],
  "maxDaily": 10
}
```

---

### Update Preferences

#### PUT `/v1/api/preferences`

Updates user preferences.

**Request Body:**
```json
{
  "userId": "user-123",
  "enabled": true,
  "quietStart": "22:00",
  "quietEnd": "08:00",
  "allowedSymbols": ["AAPL", "MSFT"],
  "maxDaily": 10
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "userId": "user-123"
}
```

---

## User Settings

### Get Settings

#### GET `/v1/api/settings/:userId`

Retrieves user settings.

**Response:** `200 OK`
```json
{
  "userId": "user-123",
  "refreshIntervalMinutes": 5
}
```

---

### Update Settings

#### PUT `/v1/api/settings`

Updates user settings.

**Request Body:**
```json
{
  "userId": "user-123",
  "refreshIntervalMinutes": 5
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "userId": "user-123"
}
```

---

## Admin Endpoints

### Configuration

#### GET `/config/get`

Retrieves admin configuration including feature flags, polling intervals, and throttling settings.

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 30,
  "kvWriteIntervalSec": 3600,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 100,
    "windowSeconds": 60
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": false
  }
}
```

---

#### POST `/config/update`

Updates admin configuration. Partial updates are supported.

**Request Body:**
```json
{
  "pollingIntervalSec": 60,
  "kvWriteIntervalSec": 7200,
  "featureFlags": {
    "simulateProviderFailure": true
  }
}
```

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 60,
  "kvWriteIntervalSec": 7200,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 100,
    "windowSeconds": 60
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": true
  }
}
```

---

### Simulate Provider Failure

#### POST `/v1/api/simulate-provider-failure`

Enables simulation mode that makes the API return stale cached data instead of calling external providers. Useful for testing fallback behavior.

**Response:** `200 OK`
```json
{
  "featureFlags": {
    "simulateProviderFailure": true
  }
}
```

---

### Disable Provider Failure

#### POST `/v1/api/disable-provider-failure`

Disables simulation mode and restores normal provider calls.

**Response:** `200 OK`
```json
{
  "featureFlags": {
    "simulateProviderFailure": false
  }
}
```

---

### Notifications

#### GET `/v1/api/notifications/recent`

Retrieves recent notification logs.

**Response:** `200 OK`
```json
{
  "notifications": [
    {
      "id": "notif-123",
      "alertId": "alert-789",
      "symbol": "AAPL",
      "threshold": 200.50,
      "price": 201.25,
      "direction": "above",
      "pushToken": "fcm-token-here",
      "status": "success",
      "sentAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

#### GET `/v1/api/notifications/failed`

Retrieves failed notification logs.

**Response:** `200 OK`
```json
{
  "notifications": [
    {
      "id": "notif-123",
      "alertId": "alert-789",
      "symbol": "AAPL",
      "threshold": 200.50,
      "price": 201.25,
      "direction": "above",
      "pushToken": "fcm-token-here",
      "status": "failed",
      "errorMessage": "Invalid token",
      "sentAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST `/v1/api/notifications/retry/:logId`

Retries sending a failed notification.

**Response:** `200 OK`
```json
{
  "success": true,
  "logId": "notif-123"
}
```

---

### Devices

#### GET `/v1/api/devices`

Retrieves all registered devices with alert counts.

**Response:** `200 OK`
```json
{
  "devices": [
    {
      "userId": "user-123",
      "pushToken": "fcm-token-here",
      "deviceInfo": "iPhone 14 Pro",
      "alertCount": 3,
      "activeAlertCount": 2,
      "createdAt": "2025-11-15T16:36:43.118Z",
      "updatedAt": "2025-11-19T17:17:44.558Z"
    }
  ]
}
```

---

#### POST `/v1/api/devices/:userId/test`

Sends a test notification to a user's device.

**Request Body:**
```json
{
  "message": "This is a test notification!"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Test notification sent successfully",
  "userId": "user-123"
}
```

---

#### DELETE `/v1/api/devices/:userId`

Deletes a user's device registration.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Device deleted successfully",
  "userId": "user-123"
}
```

---

## Error Codes

| Status Code | Description |
|-------------|-------------|
| `200` | Success |
| `201` | Created (alert creation) |
| `400` | Bad Request (validation error, missing parameters) |
| `404` | Not Found |
| `405` | Method Not Allowed |
| `500` | Internal Server Error |

**Error Response Format:**
```json
{
  "error": "Human readable error message"
}
```

---

## Rate Limits

Currently no rate limits enforced. Recommended for production:
- Stock endpoints: 100 requests/minute
- Alerts endpoints: 60 requests/minute

---

## Data Types

### AlertDirection
```typescript
type AlertDirection = "above" | "below";
```

### AlertStatus
```typescript
type AlertStatus = "active" | "paused";
```

### AlertChannel
```typescript
type AlertChannel = "notification";
```

### Alert Object
```typescript
interface Alert {
  id: string;                    // UUID
  symbol: string;                // Stock ticker (uppercase)
  direction: AlertDirection;     // Price direction trigger
  threshold: number;             // Price threshold
  status: AlertStatus;           // Alert state
  channel: AlertChannel;         // Notification method
  target: string;                // FCM Push Token
  notes: string | null;          // Optional user note
  createdAt: string;            // ISO 8601 timestamp
  updatedAt: string;            // ISO 8601 timestamp
}
```

### Stock News Item
```typescript
interface StockNewsItem {
  title: string;                 // News article title
  text: string;                  // News article text/description
  url: string;                   // News article URL
  publishedDate: string;         // Publication date
  image?: string;                // News article image URL
  source?: string;               // News source name
}
```

### Stock News Response
```typescript
interface StockNewsResponse {
  symbol: string;                // Stock ticker symbol
  news: StockNewsItem[];         // Array of news articles
  cached: boolean;               // Whether served from cache
  refreshedAt?: number;          // Timestamp when data was fetched
  stale?: boolean;               // Whether data is stale
  stale_reason?: string;         // Reason for stale data
}
```

---

## Cron Jobs

### Alert Evaluation

**Schedule:** Every 5 minutes (`*/5 * * * *`)

**Function:** 
- Fetches all active alerts
- Gets current prices for monitored symbols
- Evaluates conditions (above/below thresholds)
- Uses KV state to prevent duplicate notifications
- Sends FCM notifications for triggered alerts
- Logs all notification attempts

**Monitoring:**
```bash
wrangler tail
```

---

## OpenAPI Specification

The complete OpenAPI 3.0 specification is available at:

```
GET /openapi.json
```

This endpoint returns the full OpenAPI specification in JSON format, which can be used with tools like Swagger UI, Postman, or other API documentation generators.

---

## Error Handling

All endpoints follow consistent error response format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created (for POST requests creating resources)
- `400`: Bad Request (validation errors, missing parameters)
- `404`: Not Found
- `405`: Method Not Allowed
- `500`: Internal Server Error

---

## CORS

All endpoints support CORS with the following headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## Data Sources

- **Stock Quotes**: Financial Modeling Prep API (`/stable/quote`)
- **Company Profiles**: Financial Modeling Prep API (`/stable/profile`) with Wikipedia fallback for descriptions
- **Stock News**: Financial Modeling Prep API (`/stable/news/stock`)
- **Historical Data**: Stored in Cloudflare D1 database
- **Stock Details**: Aggregated from multiple FMP endpoints

---

## Notes

1. **Symbol Normalization**: All stock symbols are automatically normalized to uppercase and trimmed.
2. **Caching**: Stock data is cached based on `pollingIntervalSec` configuration (default: 30 seconds). Cache TTL is set to `pollingIntervalSec + 5` seconds.
3. **Image URLs**: If profile data is unavailable, default image URLs are constructed using the pattern: `https://images.financialmodelingprep.com/symbol/{SYMBOL}.png`
4. **Description Fallback**: Company descriptions are fetched from multiple sources in order: Profile API → Quote API → Wikipedia API
5. **Name Field**: The `name` field is set from `name` or `companyName` fields, ensuring it's always present
6. **Batch Requests**: The `/v1/api/get-stocks` endpoint fetches each symbol individually in parallel (the FMP batch endpoint doesn't support comma-separated symbols)
7. **Provider Failure Handling**: All endpoints gracefully handle provider failures by returning cached/stale data when available, or empty arrays/objects when not
8. **Simulation Mode**: The `simulateProviderFailure` feature flag allows testing fallback behavior without actual API failures
9. **News API**: Uses `/stable/news/stock?symbols={SYMBOL}` endpoint format from FMP API

---

## Examples

### Fetching Stock News

```bash
# Get latest news for Apple
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock-news?symbol=AAPL"

# Get latest news for Amazon
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock-news?symbol=AMZN"
```

### Creating an Alert and Monitoring

```bash
# 1. Register push token
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/v1/api/push-token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "token": "fcm-token-here",
    "deviceInfo": "iPhone 14 Pro"
  }'

# 2. Create alert for AAPL above $200
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "direction": "above",
    "threshold": 200,
    "channel": "notification",
    "target": "fcm-token-here"
  }'

# 3. List all alerts
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts

# 4. Check current AAPL price
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock?symbol=AAPL"

# 5. Get comprehensive stock details
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock-details?symbol=AAPL"

# 6. Update alert to pause it
curl -X PUT https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/{id} \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# 7. Delete alert
curl -X DELETE https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/{id}
```

---

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test get-stock-news.spec.ts

# Run tests in watch mode (local dev)
npm run test -- --watch
```

---

## Support

For issues or questions:
- Check logs: `wrangler tail`
- View metrics: Cloudflare Dashboard → Workers → stockly-api
- API Documentation: This file (`API_DOC.md`)
- OpenAPI Spec: `/openapi.json`

