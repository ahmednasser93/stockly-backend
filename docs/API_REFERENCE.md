# Stockly API Reference

**Base URL:** `https://stockly-api.ahmednasser1993.workers.dev`  
**Version:** 1.0.0  
**Last Updated:** November 14, 2025

---

## Table of Contents

- [Authentication](#authentication)
- [Stock Endpoints](#stock-endpoints)
- [Alerts Endpoints](#alerts-endpoints)
- [Error Codes](#error-codes)
- [Rate Limits](#rate-limits)

---

## Authentication

Currently, no authentication is required. CORS is enabled for all origins.

**CORS Headers:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## Stock Endpoints

### Health Check

**Endpoint:** `GET /v1/api/health`

**Description:** Returns API health status

**Response:**
```json
{
  "status": "ok"
}
```

---

### Get Single Stock Quote

**Endpoint:** `GET /v1/api/get-stock`

**Description:** Fetches real-time quote for a single stock symbol

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock ticker symbol (e.g., AAPL) |

**Example Request:**
```bash
GET /v1/api/get-stock?symbol=AAPL
```

**Response:**
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "price": 274.16,
  "changePercentage": 0.4433,
  "change": 1.21,
  "volume": 29978525,
  "dayLow": 269.6,
  "dayHigh": 275.9583,
  "yearHigh": 277.32,
  "yearLow": 169.21,
  "marketCap": 4051084938480,
  "priceAvg50": 255.272,
  "priceAvg200": 225.2017,
  "exchange": "NASDAQ",
  "open": 271.05,
  "previousClose": 272.95,
  "timestamp": 1763147914
}
```

**Caching:** Results cached in D1 for 30 seconds

---

### Get Multiple Stock Quotes

**Endpoint:** `GET /v1/api/get-stocks`

**Description:** Fetches quotes for multiple symbols in one request

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbols` | string | Yes | Comma-separated list of symbols (max 10) |

**Example Request:**
```bash
GET /v1/api/get-stocks?symbols=AAPL,MSFT,GOOGL
```

**Response:**
```json
[
  { "symbol": "AAPL", "price": 274.16, ... },
  { "symbol": "MSFT", "price": 350.25, ... },
  { "symbol": "GOOGL", "price": 140.50, ... }
]
```

**Caching:** Per-symbol cache (30 seconds), falls back to D1 if API fails

---

### Search Stock Symbols

**Endpoint:** `GET /v1/api/search-stock`

**Description:** Search for stock symbols by name or ticker

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search term (min 1 character) |

**Example Request:**
```bash
GET /v1/api/search-stock?query=apple
```

**Response:**
```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "currency": "USD",
    "stockExchange": "NASDAQ",
    "exchangeShortName": "NASDAQ"
  },
  ...
]
```

**Caching:** Results cached in D1 for 20 minutes

---

## Alerts Endpoints

### List All Alerts

**Endpoint:** `GET /v1/api/alerts`

**Description:** Returns all configured price alerts

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
      "channel": "email",
      "target": "user@example.com",
      "notes": "Watch for breakout",
      "createdAt": "2025-11-14T10:30:00.000Z",
      "updatedAt": "2025-11-14T10:30:00.000Z"
    }
  ]
}
```

---

### Create Alert

**Endpoint:** `POST /v1/api/alerts`

**Description:** Creates a new price alert

**Request Body:**
```json
{
  "symbol": "AAPL",
  "direction": "above",
  "threshold": 200.50,
  "channel": "email",
  "target": "user@example.com",
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
| `target` | string | Yes | Expo Push Token (e.g., "ExponentPushToken[...]") |
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
  "target": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
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

### Get Single Alert

**Endpoint:** `GET /v1/api/alerts/:id`

**Description:** Retrieves a specific alert by UUID

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
  ...
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

**Endpoint:** `PUT /v1/api/alerts/:id`

**Description:** Updates an existing alert (partial updates supported)

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
  "channel": "webhook",
  "target": "https://hooks.example.com/alert",
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

**Endpoint:** `DELETE /v1/api/alerts/:id`

**Description:** Deletes an alert and its KV state

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

## Error Codes

| Status Code | Description |
|-------------|-------------|
| `200` | Success |
| `201` | Created (alert creation) |
| `400` | Bad Request (validation error) |
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
  target: string;                // Email or webhook URL
  notes: string | null;          // Optional user note
  createdAt: string;            // ISO 8601 timestamp
  updatedAt: string;            // ISO 8601 timestamp
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
- Logs triggered alerts (ready for email/webhook integration)

**Monitoring:**
```bash
wrangler tail
```

---

## Examples

### Creating an Alert and Monitoring

```bash
# 1. Create alert for AAPL above $200
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "direction": "above",
    "threshold": 200,
    "channel": "email",
    "target": "alerts@example.com"
  }'

# 2. List all alerts
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts

# 3. Check current AAPL price
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock?symbol=AAPL"

# 4. Update alert to pause it
curl -X PUT https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/{id} \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# 5. Delete alert
curl -X DELETE https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/{id}
```

---

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test alerts-evaluate.spec.ts

# Run tests in watch mode (local dev)
npm run test -- --watch
```

---

## Support

For issues or questions:
- Check `README.md` for setup instructions
- Check `DEPLOYMENT.md` for deployment guide
- Check logs: `wrangler tail`
- View metrics: Cloudflare Dashboard → Workers → stockly-api

