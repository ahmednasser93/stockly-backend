# FMP API Endpoint Issue

## Problem
The Financial Modeling Prep (FMP) API endpoints for market data (gainers, losers, actives) are returning empty arrays or 404 errors.

## Current Status
- **v3 endpoints** (`/v3/stock_market/gainers`, etc.): Return 404 - "Legacy Endpoint" error
- **v4 endpoints** (`/v4/gainers`, etc.): Return 404 or empty arrays `[]`

## Root Cause
The FMP API has deprecated these endpoints. According to their error messages:
- Legacy endpoints are "no longer supported"
- Only available for "legacy users who have valid subscriptions prior August 31, 2025"
- Requires upgrading to a paid plan

## Current Behavior
The API now:
1. Returns empty arrays `[]` (HTTP 200) when FMP API returns 404
2. This is valid behavior - "no data available" is different from "API error"
3. The mobile app should handle empty arrays gracefully

## Solutions

### Option 1: Use Alternative Data Source
- Consider using a different financial data provider
- Examples: Alpha Vantage, Yahoo Finance API, IEX Cloud, Polygon.io

### Option 2: Calculate Gainers/Losers Manually
- Fetch quotes for a list of popular stocks
- Calculate percentage changes
- Sort and return top gainers/losers

### Option 3: Upgrade FMP Subscription
- Upgrade to a paid FMP plan that includes these endpoints
- Update API key in Cloudflare Workers environment variables

### Option 4: Use Mock Data (Development Only)
- For development/testing, return mock data
- Not recommended for production

## Recommendation
For now, the endpoints return empty arrays which is acceptable behavior. The mobile app should display "No data available" when receiving empty arrays. Consider implementing Option 2 (calculate manually) as a fallback if FMP continues to be unavailable.

