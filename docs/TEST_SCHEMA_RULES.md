# API Test Schema Rules

## ⚠️ CRITICAL: Schema Immutability

**DO NOT MODIFY TEST SCHEMAS WITHOUT TEAM APPROVAL**

The schema definitions in `test/schemas.ts` define the **contract** between the API and its clients (webapp, mobile app, etc.). These schemas represent the public API interface and must remain stable.

## Rules for Schema Changes

1. **Breaking Changes Are Prohibited**
   - Do not remove required fields
   - Do not change field types
   - Do not rename fields
   - Do not change enum values

2. **Allowed Changes (with approval)**
   - Adding optional fields (must be backward compatible)
   - Adding new endpoints/schemas
   - Documentation updates only

3. **Process for Schema Changes**
   - Create a PR with schema changes
   - Get approval from team leads
   - Update API version if breaking change is necessary
   - Notify all clients (webapp, mobile) before deployment
   - Update OpenAPI specification

## Schema Validation in Tests

All API response tests MUST validate against the schemas in `test/schemas.ts`:

```typescript
import { validateStockQuoteResponse } from "./schemas";

const response = await getStock(...);
const data = await response.json();
expect(validateStockQuoteResponse(data)).toBe(true);
```

## Current API Version

- **Version**: 1.0.0
- **Base URL**: `https://stockly-api.ahmednasser1993.workers.dev`
- **Last Schema Update**: [Date of last change]

## Endpoints and Their Schemas

### Stock Quotes
- `GET /v1/api/get-stock` → `StockQuoteResponse`
- `GET /v1/api/get-stocks` → `StockQuotesResponse`
- `GET /v1/api/search-stock` → `SearchStockResponse`

### Historical Prices
- `GET /v1/api/get-historical` → `HistoricalPricesResponse`

### Alerts
- `GET /v1/api/alerts` → `AlertsListResponse`
- `POST /v1/api/alerts` → `Alert` (Request: `CreateAlertRequest`)
- `GET /v1/api/alerts/{id}` → `Alert`
- `PUT /v1/api/alerts/{id}` → `Alert` (Request: `UpdateAlertRequest`)
- `DELETE /v1/api/alerts/{id}` → `SuccessResponse`

### Health & Admin
- `GET /v1/api/health` → `HealthCheckResponse`
- `GET /config/get` → `AdminConfig`
- `POST /v1/api/simulate-provider-failure` → `AdminConfig`
- `POST /v1/api/disable-provider-failure` → `AdminConfig`

## Enforcement

- Schema validation tests run automatically in CI/CD
- All PRs must pass schema validation tests
- Schema changes automatically fail builds unless approved

