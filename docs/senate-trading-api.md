# Senate Trading API Documentation

This document describes the Senate Trading API endpoints for tracking US Senate and House trading disclosures.

**Base URL**: `/v1/api/senate-trading`

All endpoints require authentication via JWT token (except public feed endpoints).

---

## Endpoints

### 1. Get Senate Trading Feed

Get a paginated feed of recent senator trades with optional filters.

**Endpoint**: `GET /v1/api/senate-trading/feed`

**Authentication**: Not required (public endpoint)

**Query Parameters**:
- `symbol` (string, optional) - Filter by stock symbol (e.g., "AAPL")
- `senatorName` (string, optional) - Filter by senator name (e.g., "Nancy Pelosi")
- `transactionType` (string, optional) - Filter by transaction type: "Purchase", "Sale", or "Exchange"
- `startDate` (string, optional) - Filter trades from this date (YYYY-MM-DD format)
- `endDate` (string, optional) - Filter trades until this date (YYYY-MM-DD format)
- `limit` (number, optional) - Number of results to return (default: 100, max: 1000)
- `offset` (number, optional) - Number of results to skip for pagination (default: 0)

**Example Request**:
```bash
GET /v1/api/senate-trading/feed?symbol=AAPL&limit=50&offset=0
```

**Response** (200 OK):
```json
{
  "trades": [
    {
      "id": "uuid",
      "symbol": "AAPL",
      "senatorName": "Nancy Pelosi",
      "transactionType": "Purchase",
      "amountRangeMin": 15001,
      "amountRangeMax": 50000,
      "disclosureDate": "2023-10-26",
      "transactionDate": "2023-10-25",
      "fmpId": "FMP-12345",
      "createdAt": "2023-10-26T10:00:00Z",
      "updatedAt": "2023-10-26T10:00:00Z"
    }
  ]
}
```

**Error Responses**:
- `500` - Server error

---

### 2. Get Senators List

Get a list of all unique senators who have made trades.

**Endpoint**: `GET /v1/api/senate-trading/senators`

**Authentication**: Not required (public endpoint)

**Example Request**:
```bash
GET /v1/api/senate-trading/senators
```

**Response** (200 OK):
```json
{
  "senators": [
    "Nancy Pelosi",
    "John Doe",
    "Jane Smith"
  ]
}
```

**Error Responses**:
- `500` - Server error

---

### 3. Get User's Followed Senators

Get the list of senators the authenticated user is following.

**Endpoint**: `GET /v1/api/senate-trading/follows`

**Authentication**: Required (JWT token)

**Example Request**:
```bash
GET /v1/api/senate-trading/follows
Authorization: Bearer <jwt_token>
```

**Response** (200 OK):
```json
{
  "follows": [
    {
      "userId": "user-uuid",
      "username": "john_doe",
      "senatorName": "Nancy Pelosi",
      "alertOnPurchase": true,
      "alertOnSale": true,
      "createdAt": "2023-10-26T10:00:00Z",
      "updatedAt": "2023-10-26T10:00:00Z"
    }
  ]
}
```

**Error Responses**:
- `401` - Authentication required
- `500` - Server error

---

### 4. Follow a Senator

Start following a senator to receive alerts when they trade.

**Endpoint**: `POST /v1/api/senate-trading/follows`

**Authentication**: Required (JWT token)

**Request Body**:
```json
{
  "senatorName": "Nancy Pelosi",
  "alertOnPurchase": true,
  "alertOnSale": true
}
```

**Example Request**:
```bash
POST /v1/api/senate-trading/follows
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "senatorName": "Nancy Pelosi",
  "alertOnPurchase": true,
  "alertOnSale": false
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "senatorName": "Nancy Pelosi"
}
```

**Error Responses**:
- `400` - Invalid request (missing senatorName or invalid types)
- `401` - Authentication required
- `500` - Server error

---

### 5. Unfollow a Senator

Stop following a senator.

**Endpoint**: `DELETE /v1/api/senate-trading/follows/{senatorName}`

**Authentication**: Required (JWT token)

**Path Parameters**:
- `senatorName` (string, required) - Name of the senator to unfollow (URL encoded)

**Example Request**:
```bash
DELETE /v1/api/senate-trading/follows/Nancy%20Pelosi
Authorization: Bearer <jwt_token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "senatorName": "Nancy Pelosi"
}
```

**Error Responses**:
- `401` - Authentication required
- `500` - Server error

---

### 6. Update Follow Preferences

Update alert preferences for a followed senator.

**Endpoint**: `PUT /v1/api/senate-trading/follows/{senatorName}`

**Authentication**: Required (JWT token)

**Path Parameters**:
- `senatorName` (string, required) - Name of the senator (URL encoded)

**Request Body**:
```json
{
  "alertOnPurchase": true,
  "alertOnSale": false
}
```

**Example Request**:
```bash
PUT /v1/api/senate-trading/follows/Nancy%20Pelosi
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "alertOnPurchase": true,
  "alertOnSale": false
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "senatorName": "Nancy Pelosi"
}
```

**Error Responses**:
- `400` - Invalid request (invalid types)
- `401` - Authentication required
- `500` - Server error

---

### 7. Get User's Senator Alerts

Get recent senator trades that match the user's holdings or followed senators.

**Endpoint**: `GET /v1/api/senate-trading/alerts`

**Authentication**: Required (JWT token)

**Example Request**:
```bash
GET /v1/api/senate-trading/alerts
Authorization: Bearer <jwt_token>
```

**Response** (200 OK):
```json
{
  "trades": [
    {
      "id": "uuid",
      "symbol": "AAPL",
      "senatorName": "Nancy Pelosi",
      "transactionType": "Purchase",
      "amountRangeMin": 15001,
      "amountRangeMax": 50000,
      "disclosureDate": "2023-10-26",
      "transactionDate": "2023-10-25",
      "fmpId": "FMP-12345",
      "createdAt": "2023-10-26T10:00:00Z",
      "updatedAt": "2023-10-26T10:00:00Z"
    }
  ],
  "count": 1
}
```

**Error Responses**:
- `401` - Authentication required
- `500` - Server error

---

## Data Models

### SenateTrade

```typescript
interface SenateTrade {
  id: string;                    // UUID
  symbol: string;                // Stock symbol (e.g., "AAPL")
  senatorName: string;           // Full name of senator
  transactionType: "Purchase" | "Sale" | "Exchange";
  amountRangeMin: number | null; // Minimum amount in USD
  amountRangeMax: number | null; // Maximum amount in USD
  disclosureDate: string;       // Date of disclosure (YYYY-MM-DD)
  transactionDate: string | null; // Date of transaction (YYYY-MM-DD)
  fmpId: string | null;         // FMP API unique identifier
  createdAt: string;            // ISO 8601 timestamp
  updatedAt: string;            // ISO 8601 timestamp
}
```

### UserSenatorFollow

```typescript
interface UserSenatorFollow {
  userId: string;               // User UUID
  username: string;             // Username
  senatorName: string;          // Full name of senator
  alertOnPurchase: boolean;     // Alert when senator purchases
  alertOnSale: boolean;         // Alert when senator sells
  createdAt: string;           // ISO 8601 timestamp
  updatedAt: string;           // ISO 8601 timestamp
}
```

---

## Alert Logic

Senator alerts are triggered when:

1. **Holdings Match**: A senator trades in a stock that the user holds (from favorite stocks list)
2. **Followed Senator**: A senator the user follows makes any trade (based on `alertOnPurchase`/`alertOnSale` preferences)

User preferences control alert behavior:
- `senatorAlertsEnabled`: Master toggle for all senator alerts
- `senatorAlertHoldingsOnly`: Only alert for trades in held stocks
- `senatorAlertFollowedOnly`: Only alert for trades by followed senators

---

## Integration with Notification Preferences

Senator alert preferences are part of the user notification preferences API:

**Endpoint**: `GET /v1/api/preferences` and `POST /v1/api/preferences`

**Additional Fields**:
- `senatorAlertsEnabled` (boolean) - Enable/disable all senator alerts
- `senatorAlertHoldingsOnly` (boolean) - Only alert for held stocks
- `senatorAlertFollowedOnly` (boolean) - Only alert for followed senators

---

## Cron Job

The senate trading data is automatically synced from the FMP API via a cron job that runs every 6 hours.

**Schedule**: `0 */6 * * *` (at 00:00, 06:00, 12:00, 18:00 UTC)

The cron job:
1. Fetches latest trades from FMP API
2. Stores new trades in the database (deduplicated by `fmp_id`)
3. Evaluates alerts for all users
4. Sends push notifications for matching trades

---

## Error Handling

All endpoints return standard error responses:

```json
{
  "error": "Error message description"
}
```

Common error codes:
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid authentication)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## Rate Limiting

The FMP API has rate limits. The cron job handles this by:
- Fetching data in batches
- Implementing retry logic with exponential backoff
- Logging rate limit errors for monitoring

---

## Data Source

All senate trading data is sourced from the Financial Modeling Prep (FMP) API:
- **Endpoint**: `GET /v4/senate-trading`
- **Documentation**: See `api/docs/financial_modeling_prep_endpoints.md`

The data is updated every 6 hours via cron job, ensuring users have access to recent trading disclosures.


