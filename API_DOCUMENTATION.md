# Stockly API Documentation

Complete API reference for the Stockly backend service.

**Base URL:** `https://stockly-api.ahmednasser1993.workers.dev`

All endpoints support CORS and return JSON responses.

---

## Table of Contents

1. [Health Check](#health-check)
2. [Stock Quotes](#stock-quotes)
   - [Get Single Stock](#get-single-stock)
   - [Get Multiple Stocks](#get-multiple-stocks)
   - [Search Stocks](#search-stocks)
3. [Historical Prices](#historical-prices)
4. [Price Alerts](#price-alerts)
5. [Push Notifications](#push-notifications)
6. [User Preferences](#user-preferences)
7. [User Settings](#user-settings)
8. [Admin Endpoints](#admin-endpoints)

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

## Stock Quotes

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
  },
  {
    "symbol": "GOOGL",
    "name": "Alphabet Inc.",
    "price": 150.25,
    "change": 1.50,
    "changePercentage": 1.01,
    "volume": 15000000,
    "dayLow": 149.00,
    "dayHigh": 151.00,
    "yearLow": 120.00,
    "yearHigh": 160.00,
    "marketCap": 1900000000000,
    "exchange": "NASDAQ",
    "image": "https://images.financialmodelingprep.com/symbol/GOOGL.png",
    "description": "Alphabet Inc. provides various products and platforms in the United States, Europe, the Middle East, Africa, the Asia-Pacific, Canada, and Latin America."
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
- `exchangeFullName` (string): Full exchange name

**Example Request:**
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/search-stock?query=AP"
```

**Example Response:**
```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "currency": "USD",
    "exchangeFullName": "NASDAQ"
  },
  {
    "symbol": "APTV",
    "name": "Aptiv PLC",
    "currency": "USD",
    "exchangeFullName": "NYSE"
  }
]
```

**Error Responses:**
- `400`: Missing `query` parameter or query too short
- `200` with empty array: No matches found

---

## Historical Prices

### GET `/v1/api/get-historical`

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

### List All Alerts

#### GET `/v1/api/alerts`

Retrieves all price alerts.

**Response:**
```json
{
  "alerts": [
    {
      "id": "alert-123",
      "symbol": "AAPL",
      "direction": "above",
      "price": 200.00,
      "status": "active",
      "channel": "notification",
      "userId": "user-456",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:00:00Z"
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
  "price": 200.00,
  "channel": "notification",
  "userId": "user-456"
}
```

**Fields:**
- `symbol` (required): Stock ticker symbol
- `direction` (required): `"above"` or `"below"`
- `price` (required): Target price (number)
- `channel` (required): `"notification"` (push notification)
- `userId` (required): User identifier

**Response:** `201 Created`
```json
{
  "id": "alert-123",
  "symbol": "AAPL",
  "direction": "above",
  "price": 200.00,
  "status": "active",
  "channel": "notification",
  "userId": "user-456",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

**Error Responses:**
- `400`: Invalid payload or validation errors
- `500`: Server error

---

### Get Alert

#### GET `/v1/api/alerts/{id}`

Retrieves a specific alert by ID.

**Response:** `200 OK`
```json
{
  "id": "alert-123",
  "symbol": "AAPL",
  "direction": "above",
  "price": 200.00,
  "status": "active",
  "channel": "notification",
  "userId": "user-456",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

**Error Responses:**
- `404`: Alert not found

---

### Update Alert

#### PUT `/v1/api/alerts/{id}`

Updates an existing alert.

**Request Body:**
```json
{
  "price": 210.00,
  "status": "paused"
}
```

**Fields (all optional):**
- `price` (number): New target price
- `status` (string): `"active"`, `"paused"`, or `"triggered"`
- `direction` (string): `"above"` or `"below"`

**Response:** `200 OK`
```json
{
  "id": "alert-123",
  "symbol": "AAPL",
  "direction": "above",
  "price": 210.00,
  "status": "paused",
  "channel": "notification",
  "userId": "user-456",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-02T00:00:00Z"
}
```

**Error Responses:**
- `400`: Invalid payload
- `404`: Alert not found
- `500`: Server error

---

### Delete Alert

#### DELETE `/v1/api/alerts/{id}`

Deletes an alert.

**Response:** `200 OK`
```json
{
  "success": true
}
```

**Error Responses:**
- `404`: Alert not found

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

**Response:** `200 OK`
```json
{
  "success": true,
  "userId": "user-123"
}
```

**Error Responses:**
- `400`: Invalid token format or missing required fields
- `500`: Server error

---

### Get Push Token

#### GET `/v1/api/push-token/{userId}`

Retrieves a user's push token.

**Response:** `200 OK`
```json
{
  "userId": "user-123",
  "token": "fcm-token-here",
  "deviceInfo": "iPhone 14 Pro",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

**Error Responses:**
- `404`: Token not found

---

## User Preferences

### Get Preferences

#### GET `/v1/api/preferences/{userId}`

Retrieves user preferences.

**Response:** `200 OK`
```json
{
  "userId": "user-123",
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
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
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
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

#### GET `/v1/api/settings/{userId}`

Retrieves user settings.

**Response:** `200 OK`
```json
{
  "userId": "user-123",
  "settings": {
    "currency": "USD",
    "language": "en"
  }
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
  "settings": {
    "currency": "USD",
    "language": "en"
  }
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

### Get Configuration

#### GET `/config/get`

Retrieves admin configuration including feature flags.

**Response:** `200 OK`
```json
{
  "featureFlags": {
    "simulateProviderFailure": false
  }
}
```

---

### Update Configuration

#### POST `/config/update`

Updates admin configuration.

**Request Body:**
```json
{
  "featureFlags": {
    "simulateProviderFailure": true
  }
}
```

**Response:** `200 OK`
```json
{
  "featureFlags": {
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

### Get Recent Notifications

#### GET `/v1/api/notifications/recent`

Retrieves recent notification logs.

**Response:** `200 OK`
```json
{
  "notifications": [
    {
      "id": "notif-123",
      "userId": "user-456",
      "alertId": "alert-789",
      "status": "sent",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### Get Failed Notifications

#### GET `/v1/api/notifications/failed`

Retrieves failed notification logs.

**Response:** `200 OK`
```json
{
  "notifications": [
    {
      "id": "notif-123",
      "userId": "user-456",
      "alertId": "alert-789",
      "status": "failed",
      "error": "Invalid token",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### Retry Notification

#### POST `/v1/api/notifications/retry/{logId}`

Retries sending a failed notification.

**Response:** `200 OK`
```json
{
  "success": true,
  "logId": "notif-123"
}
```

---

### Get All Devices

#### GET `/v1/api/devices`

Retrieves all registered devices.

**Response:** `200 OK`
```json
{
  "devices": [
    {
      "userId": "user-123",
      "token": "fcm-token-here",
      "deviceInfo": "iPhone 14 Pro",
      "updatedAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### Send Test Notification

#### POST `/v1/api/devices/{userId}/test`

Sends a test notification to a user's device.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Test notification sent"
}
```

---

### Delete Device

#### DELETE `/v1/api/devices/{userId}`

Deletes a user's device registration.

**Response:** `200 OK`
```json
{
  "success": true
}
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
- `Access-Control-Allow-Headers: Content-Type`

---

## Rate Limiting

Currently, there are no rate limits enforced. However, please use the API responsibly.

---

## Data Sources

- **Stock Quotes**: Financial Modeling Prep API
- **Company Profiles**: Financial Modeling Prep API with Wikipedia fallback for descriptions
- **Historical Data**: Stored in Cloudflare D1 database

---

## Notes

1. **Symbol Normalization**: All stock symbols are automatically normalized to uppercase and trimmed.
2. **Caching**: Stock quotes are cached for 30 seconds to reduce API calls.
3. **Image URLs**: If profile data is unavailable, default image URLs are constructed using the pattern: `https://images.financialmodelingprep.com/symbol/{SYMBOL}.png`
4. **Description Fallback**: Company descriptions are fetched from multiple sources in order: Profile API → Quote API → Wikipedia API
5. **Name Field**: The `name` field is set from `name` or `companyName` fields, ensuring it's always present
6. **Batch Requests**: The `/v1/api/get-stocks` endpoint fetches each symbol individually in parallel (the FMP batch endpoint doesn't support comma-separated symbols)

