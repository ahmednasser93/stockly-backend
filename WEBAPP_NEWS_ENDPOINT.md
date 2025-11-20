# Stock News API - Webapp Integration Guide

## Endpoint: `GET /v1/api/get-news`

Fetches latest stock news articles for one or multiple stock symbols. Supports both single and multiple symbol requests. Includes pagination support for date filtering and result limiting.

---

## Quick Start

### Single Symbol Request
```typescript
const response = await fetch(
  'https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL'
);
const data = await response.json();
```

### Multiple Symbols Request (max 10)
```typescript
const response = await fetch(
  'https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbols=AAPL,MSFT,GOOGL'
);
const data = await response.json();
```

### With Pagination
```typescript
// Date range + pagination
const response = await fetch(
  'https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL&from=2025-01-01&to=2025-01-31&page=0&limit=20'
);
const data = await response.json();

// Limit results only
const response = await fetch(
  'https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL&page=0&limit=10'
);
const data = await response.json();
```

---

## API Details

**Base URL:** `https://stockly-api.ahmednasser1993.workers.dev`  
**Endpoint:** `/v1/api/get-news`  
**Method:** `GET`  
**CORS:** Enabled for all origins

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `symbol` | string | Optional* | Single stock ticker symbol | `AAPL` |
| `symbols` | string | Optional* | Comma-separated list of symbols (max 10) | `AAPL,MSFT,GOOGL` |
| `from` | string | Optional | Start date for news filtering (YYYY-MM-DD format) | `2025-01-01` |
| `to` | string | Optional | End date for news filtering (YYYY-MM-DD format) | `2025-01-31` |
| `page` | number | Optional | Page number (0-based). Default: `0` | `0` |
| `limit` | number | Optional | Number of results per page (1-250). Default: `20`. Maximum: `250` | `20` |

**Note:** Either `symbol` OR `symbols` parameter is required (not both)  
**Note:** `from` date must be before or equal to `to` date if both provided

### Limits
- Maximum 10 symbols per request when using `symbols` parameter
- Maximum 250 results per page (`limit` parameter)
- Symbols are automatically normalized to uppercase
- Duplicate symbols are automatically deduplicated

---

## Response Format

### Success Response (200 OK)

```json
{
  "symbols": ["AAPL", "MSFT"],
  "news": [
    {
      "title": "Apple Announces New iPhone",
      "text": "Apple has announced a new iPhone model...",
      "url": "https://example.com/news/article",
      "publishedDate": "2024-01-20T10:00:00Z",
      "image": "https://example.com/image.jpg",
      "site": "TechCrunch",
      "type": "news"
    },
    {
      "title": "Microsoft Earnings Beat Expectations",
      "text": "Microsoft reported earnings that beat...",
      "url": "https://example.com/news/article2",
      "publishedDate": "2024-01-19T15:30:00Z",
      "image": null,
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

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `symbols` | `string[]` | Array of stock ticker symbols that were requested |
| `news` | `NewsItem[]` | Array of news articles (combined from all requested symbols) |
| `pagination` | `object` | Pagination metadata (always present) |
| `pagination.page` | `number` | Current page number (0-based) |
| `pagination.limit` | `number` | Number of results per page |
| `pagination.total` | `number` | Total number of news articles returned in this response |
| `pagination.hasMore` | `boolean` | Whether there are more pages available (estimated) |
| `cached` | `boolean` | `true` if response was served from cache, `false` if fetched fresh |
| `partial` | `boolean?` | `true` if some data failed to fetch (graceful degradation) |
| `error` | `string?` | Error message if fetch failed (still returns 200 status with empty array) |

### NewsItem Object

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | News article headline/title |
| `text` | `string` | News article text/description/body |
| `url` | `string` | URL to the full news article |
| `publishedDate` | `string` | Publication date in ISO 8601 format (e.g., "2024-01-20T10:00:00Z") |
| `image` | `string \| null` | URL to article image/thumbnail (can be null) |
| `site` | `string` | News source/site name (e.g., "TechCrunch", "Reuters", "Bloomberg") |
| `type` | `string` | Content type (typically "news") |

### Error Responses

#### 400 Bad Request
```json
{
  "error": "symbol or symbols parameter required"
}
```

```json
{
  "error": "maximum 10 symbols allowed"
}
```

```json
{
  "error": "invalid 'from' date format (expected YYYY-MM-DD)"
}
```

```json
{
  "error": "invalid 'page' parameter (must be non-negative integer)"
}
```

```json
{
  "error": "invalid 'limit' parameter (must be 1-250)"
}
```

```json
{
  "error": "'from' date must be before or equal to 'to' date"
}
```

#### 200 OK with Error (Graceful Degradation)
When the FMP API fails, the endpoint returns 200 with an empty news array:

```json
{
  "symbols": ["AAPL"],
  "news": [],
  "cached": false,
  "partial": true,
  "error": "Failed to fetch news"
}
```

**Important:** Always check for `partial` or `error` fields and handle gracefully.

---

## TypeScript Types

```typescript
interface NewsItem {
  title: string;
  text: string;
  url: string;
  publishedDate: string; // ISO 8601 format
  image: string | null;
  site: string;
  type: string;
}

interface NewsResponse {
  symbols: string[];
  news: NewsItem[];
  cached: boolean;
  partial?: boolean;
  error?: string;
}
```

---

## Usage Examples

### React Hook Example

```typescript
import { useState, useEffect } from 'react';

interface NewsItem {
  title: string;
  text: string;
  url: string;
  publishedDate: string;
  image: string | null;
  site: string;
  type: string;
}

interface NewsResponse {
  symbols: string[];
  news: NewsItem[];
  cached: boolean;
  partial?: boolean;
  error?: string;
}

function useStockNews(symbols: string[]) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNews() {
      if (symbols.length === 0) {
        setNews([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const symbolsParam = symbols.join(',');
        const response = await fetch(
          `https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbols=${symbolsParam}`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: NewsResponse = await response.json();

        // Handle graceful degradation
        if (data.error || data.partial) {
          console.warn('News fetch returned partial data:', data.error);
          // Still set news (will be empty array)
        }

        setNews(data.news || []);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setNews([]); // Fallback to empty array
      } finally {
        setLoading(false);
      }
    }

    fetchNews();
  }, [symbols.join(',')]); // Re-fetch when symbols change

  return { news, loading, error };
}

// Usage in component
function StockNewsWidget({ symbol }: { symbol: string }) {
  const { news, loading, error } = useStockNews([symbol]);

  if (loading) return <div>Loading news...</div>;
  if (error) return <div>Error: {error}</div>;
  if (news.length === 0) return <div>No news available</div>;

  return (
    <div>
      <h2>Latest News</h2>
      {news.map((item, index) => (
        <article key={index}>
          <h3>{item.title}</h3>
          <p>{item.text.substring(0, 200)}...</p>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            Read more
          </a>
          <small>{item.site} • {new Date(item.publishedDate).toLocaleDateString()}</small>
        </article>
      ))}
    </div>
  );
}
```

### Simple Fetch Function

```typescript
interface NewsPaginationOptions {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  page?: number; // 0-based
  limit?: number; // 1-250
}

async function fetchStockNews(
  symbols: string[],
  pagination?: NewsPaginationOptions
): Promise<NewsItem[]> {
  if (symbols.length === 0) return [];
  if (symbols.length > 10) {
    throw new Error('Maximum 10 symbols allowed');
  }

  const symbolsParam = symbols.join(',');
  const params = new URLSearchParams({ symbols: symbolsParam });
  
  // Add pagination params if provided
  if (pagination?.from) params.append('from', pagination.from);
  if (pagination?.to) params.append('to', pagination.to);
  if (pagination?.page !== undefined) params.append('page', pagination.page.toString());
  if (pagination?.limit !== undefined) params.append('limit', Math.min(pagination.limit, 250).toString());

  const url = `https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: NewsResponse = await response.json();

    // Handle graceful degradation
    if (data.error) {
      console.warn('News API error:', data.error);
      return []; // Return empty array on error
    }

    return data.news || [];
  } catch (error) {
    console.error('Failed to fetch news:', error);
    return []; // Always return empty array on error (graceful degradation)
  }
}

// Usage - without pagination
const news = await fetchStockNews(['AAPL', 'MSFT']);

// Usage - with pagination
const paginatedNews = await fetchStockNews(['AAPL'], {
  from: '2025-01-01',
  to: '2025-01-31',
  page: 0,
  limit: 20
});
```

### Single Symbol (Shortcut)

```typescript
async function fetchSingleStockNews(symbol: string): Promise<NewsItem[]> {
  const url = `https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=${symbol}`;
  
  const response = await fetch(url);
  const data: NewsResponse = await response.json();
  
  return data.news || [];
}
```

---

## Caching Behavior

The endpoint uses the same caching strategy as other stock endpoints:

- **Cache Duration:** Controlled by `pollingIntervalSec` configuration (default: 30 seconds)
- **Cache Key:** Based on sorted symbols for consistency (e.g., `AAPL,MSFT` and `MSFT,AAPL` use same cache)
- **Cache Check:** Returns cached data if age < `pollingIntervalSec`, otherwise fetches fresh data
- **Cache Indicator:** Response includes `cached: true/false` field

### Cache Configuration

The cache refresh interval is controlled by the admin configuration endpoint:

```typescript
// Get current config
const configResponse = await fetch('https://stockly-api.ahmednasser1993.workers.dev/config/get');
const config = await configResponse.json();
console.log('News cache refreshes every:', config.pollingIntervalSec, 'seconds');
```

---

## Error Handling Best Practices

### Recommended Approach

```typescript
async function fetchNewsWithErrorHandling(symbols: string[]): Promise<{
  news: NewsItem[];
  success: boolean;
  error?: string;
}> {
  try {
    const symbolsParam = symbols.join(',');
    const response = await fetch(
      `https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbols=${symbolsParam}`
    );

    if (response.status === 400) {
      const errorData = await response.json();
      return {
        news: [],
        success: false,
        error: errorData.error || 'Bad request',
      };
    }

    if (!response.ok) {
      return {
        news: [],
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const data: NewsResponse = await response.json();

    // Handle graceful degradation
    if (data.error || data.partial) {
      // Still return success with empty array - this is graceful degradation
      return {
        news: [],
        success: true, // API responded successfully, just no data
        error: data.error,
      };
    }

    return {
      news: data.news || [],
      success: true,
    };
  } catch (error) {
    return {
      news: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

---

## UI/UX Recommendations

### 1. Loading States
```typescript
{loading && <NewsSkeleton />}
```

### 2. Empty States
```typescript
{!loading && news.length === 0 && (
  <div className="empty-state">
    <p>No news available at this time.</p>
  </div>
)}
```

### 3. News Item Display
```typescript
{news.map((item, index) => (
  <Card key={index} className="news-card">
    {item.image && (
      <img src={item.image} alt={item.title} className="news-image" />
    )}
    <div className="news-content">
      <h3>{item.title}</h3>
      <p>{item.text.substring(0, 150)}...</p>
      <div className="news-meta">
        <span className="news-source">{item.site}</span>
        <span className="news-date">
          {new Date(item.publishedDate).toLocaleDateString()}
        </span>
      </div>
      <a href={item.url} target="_blank" rel="noopener noreferrer">
        Read full article →
      </a>
    </div>
  </Card>
))}
```

### 4. Pagination/Filtering
- News articles are returned in chronological order (newest first typically)
- Consider implementing client-side pagination for large result sets
- Filter by `site` if you want to show news from specific sources

---

## Integration Checklist

- [ ] Create TypeScript interfaces for `NewsResponse` and `NewsItem`
- [ ] Implement fetch function with error handling
- [ ] Handle graceful degradation (empty array on errors)
- [ ] Display loading states while fetching
- [ ] Show empty state when no news available
- [ ] Format dates properly (use `publishedDate` ISO string)
- [ ] Handle null images gracefully (show placeholder)
- [ ] Add external link indicator for news URLs
- [ ] Test with single symbol (`?symbol=AAPL`)
- [ ] Test with multiple symbols (`?symbols=AAPL,MSFT`)
- [ ] Test pagination (date range, page, limit)
- [ ] Test error handling (invalid symbols, invalid dates, invalid pagination, API failures)
- [ ] Implement caching awareness (check `cached` field for debugging)
- [ ] Implement pagination UI (next/previous buttons, page numbers)
- [ ] Handle `pagination.hasMore` to show/hide "Load More" button

---

## Testing

### Test Requests

```bash
# Single symbol
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL"

# Multiple symbols
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbols=AAPL,MSFT,GOOGL"

# With pagination (date range + page + limit)
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL&from=2025-01-01&to=2025-01-31&page=0&limit=20"

# With pagination only (limit results)
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL&page=0&limit=10"

# Error case - missing parameter
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news"

# Error case - too many symbols
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbols=AAPL,MSFT,GOOGL,AMZN,TSLA,FB,META,NVDA,INTC,AMD,QQQ"

# Error case - invalid date format
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL&from=invalid-date"

# Error case - invalid limit
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbol=AAPL&limit=500"
```

---

## Performance Tips

1. **Batching:** If you need news for multiple symbols, use the `symbols` parameter instead of multiple single requests
2. **Caching:** The API caches results, so repeated requests within the polling interval return instantly
3. **Loading States:** Always show loading indicators - initial fetch may take 1-2 seconds
4. **Error Handling:** Always handle errors gracefully - return empty array instead of breaking the UI

---

## Example: Complete News Component

```typescript
import React, { useState, useEffect } from 'react';

interface NewsItem {
  title: string;
  text: string;
  url: string;
  publishedDate: string;
  image: string | null;
  site: string;
  type: string;
}

interface NewsResponse {
  symbols: string[];
  news: NewsItem[];
  cached: boolean;
  partial?: boolean;
  error?: string;
}

interface StockNewsProps {
  symbols: string[];
  maxItems?: number;
}

export function StockNews({ symbols, maxItems = 10 }: StockNewsProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadNews() {
      if (symbols.length === 0) {
        setNews([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const symbolsParam = symbols.slice(0, 10).join(','); // Max 10 symbols
        const response = await fetch(
          `https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-news?symbols=${symbolsParam}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }

        const data: NewsResponse = await response.json();

        if (data.error) {
          console.warn('News API warning:', data.error);
          // Still show empty state, don't show error to user
        }

        // Use pagination from API or limit locally
        const limitedNews = pagination?.limit 
          ? (data.news || []) // API already limited
          : (data.news || []).slice(0, maxItems); // Limit client-side
        setNews(limitedNews);
      } catch (err) {
        console.error('Failed to fetch news:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setNews([]);
      } finally {
        setLoading(false);
      }
    }

    loadNews();
  }, [symbols.join(','), maxItems]);

  if (loading) {
    return (
      <div className="news-loading">
        <div className="skeleton">Loading news...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="news-error">
        <p>Unable to load news. Please try again later.</p>
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <div className="news-empty">
        <p>No news available for these stocks at this time.</p>
      </div>
    );
  }

  return (
    <div className="news-container">
      <h2>Latest News</h2>
      <div className="news-list">
        {news.map((item, index) => (
          <article key={index} className="news-item">
            {item.image && (
              <img
                src={item.image}
                alt={item.title}
                className="news-thumbnail"
                onError={(e) => {
                  // Hide image if fails to load
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div className="news-content">
              <h3>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-link"
                >
                  {item.title}
                </a>
              </h3>
              <p className="news-text">{item.text.substring(0, 200)}...</p>
              <div className="news-meta">
                <span className="news-source">{item.site}</span>
                <span className="news-date">
                  {new Date(item.publishedDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
```

---

## OpenAPI Specification

The endpoint is fully documented in the OpenAPI spec:

```
GET /openapi.json
```

Look for `/v1/api/get-news` in the paths section.

---

## Support

For questions or issues, refer to:
- **API Documentation:** `API_DOC.md` (full API reference)
- **OpenAPI Spec:** `GET /openapi.json`
- **Health Check:** `GET /v1/api/health`

---

**Last Updated:** November 19, 2025  
**API Version:** 1.0.0

