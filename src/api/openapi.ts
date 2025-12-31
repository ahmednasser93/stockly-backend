import { json } from "../util";

/**
 * OpenAPI 3.0 specification for Stockly API
 * This endpoint serves the complete API specification including all endpoints
 */
export async function getOpenApiSpec(): Promise<Response> {
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "Stockly API",
      version: "1.0.0",
      description:
        "Stockly API provides real-time stock quotes, historical price data, price alerts, and comprehensive stock market information.",
      contact: {
        name: "Stockly API Support",
        url: "https://stockly-api.ahmednasser1993.workers.dev",
      },
    },
    servers: [
      {
        url: "https://stockly-api.ahmednasser1993.workers.dev",
        description: "Production server",
      },
      {
        url: "http://localhost:8787",
        description: "Local development server",
      },
    ],
    tags: [
      {
        name: "Stock Quotes",
        description: "Real-time stock quote endpoints",
      },
      {
        name: "Market",
        description: "Market data endpoints (gainers, losers, actives)",
      },
      {
        name: "Historical Prices",
        description: "Historical stock price data endpoints",
      },
      {
        name: "Alerts",
        description: "Price alert management endpoints",
      },
      {
        name: "Admin",
        description: "Admin configuration and testing endpoints",
      },
      {
        name: "Health",
        description: "Health check endpoint",
      },
    ],
    paths: {
      "/v1/api/health": {
        get: {
          summary: "Health check",
          description: "Returns API health status",
          tags: ["Health"],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        example: "ok",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/get-stock": {
        get: {
          summary: "Get single stock quote",
          description: "Fetches real-time quote for a single stock symbol",
          tags: ["Stock Quotes"],
          parameters: [
            {
              name: "symbol",
              in: "query",
              required: true,
              description: "Stock ticker symbol (e.g., AAPL)",
              schema: {
                type: "string",
              },
              example: "AAPL",
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      symbol: { type: "string", example: "AAPL" },
                      name: { type: "string", example: "Apple Inc." },
                      price: { type: "number", example: 274.16 },
                      changePercentage: { type: "number", example: 0.4433 },
                      change: { type: "number", example: 1.21 },
                      volume: { type: "integer", example: 29978525 },
                      dayLow: { type: "number", example: 269.6 },
                      dayHigh: { type: "number", example: 275.9583 },
                      yearHigh: { type: "number", example: 277.32 },
                      yearLow: { type: "number", example: 169.21 },
                      marketCap: { type: "integer", example: 4051084938480 },
                      exchange: { type: "string", example: "NASDAQ" },
                      image: { type: "string", nullable: true },
                      simulationActive: { type: "boolean", nullable: true, description: "Indicates if provider failure simulation is active (testing mode)" },
                      stale: { type: "boolean", nullable: true, description: "Indicates if data is stale (simulation or actual provider failure)" },
                      stale_reason: { type: "string", nullable: true, description: "Reason for stale data: 'simulation_mode' (test), 'provider_api_error', 'provider_invalid_data', 'provider_network_error', etc." },
                      lastUpdatedAt: { type: "string", nullable: true, format: "date-time", description: "ISO timestamp of when data was last updated" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - symbol parameter required",
            },
            "404": {
              description: "Symbol not found or no_price_available (when simulation is enabled but no DB data exists)",
            },
            "500": {
              description: "Server error",
            },
          },
        },
      },
      "/v1/api/get-stocks": {
        get: {
          summary: "Get multiple stock quotes",
          description: "Fetches quotes for multiple symbols in one request",
          tags: ["Stock Quotes"],
          parameters: [
            {
              name: "symbols",
              in: "query",
              required: true,
              description: "Comma-separated list of symbols (max 10)",
              schema: {
                type: "string",
              },
              example: "AAPL,MSFT,GOOGL",
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/search-stock": {
        get: {
          summary: "Search stock symbols",
          description: "Searches for matching ticker symbols",
          tags: ["Stock Quotes"],
          parameters: [
            {
              name: "query",
              in: "query",
              required: true,
              description: "Partial symbol or company name",
              schema: {
                type: "string",
              },
              example: "AP",
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        symbol: { type: "string" },
                        name: { type: "string" },
                        currency: { type: "string" },
                        exchangeFullName: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/market/gainers": {
        get: {
          summary: "Get top gainers",
          description: "Get stocks with the biggest percentage gains today. Results are cached in Cloudflare KV for 5 minutes to minimize API calls.",
          tags: ["Market"],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              description: "Maximum number of results (default: 10, min: 1, max: 50)",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 50,
                default: 10,
              },
              example: 10,
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/MarketStockItem",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid limit parameter",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/market/losers": {
        get: {
          summary: "Get top losers",
          description: "Get stocks with the biggest percentage losses today. Results are cached in Cloudflare KV for 5 minutes to minimize API calls.",
          tags: ["Market"],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              description: "Maximum number of results (default: 10, min: 1, max: 50)",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 50,
                default: 10,
              },
              example: 10,
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/MarketStockItem",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid limit parameter",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/market/actives": {
        get: {
          summary: "Get most active stocks",
          description: "Get stocks with the highest trading volume. Results are cached in Cloudflare KV for 5 minutes to minimize API calls.",
          tags: ["Market"],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              description: "Maximum number of results (default: 10, min: 1, max: 50)",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 50,
                default: 10,
              },
              example: 10,
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/MarketStockItem",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid limit parameter",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/get-news": {
        get: {
          summary: "Get stock news (single or multiple symbols)",
          description: "Fetches latest news articles for one or multiple stock symbols from FMP API. Supports both single symbol and comma-separated multiple symbols. Results are cached based on polling interval configuration.",
          tags: ["Stock Quotes"],
          parameters: [
            {
              name: "symbol",
              in: "query",
              required: false,
              description: "Stock ticker symbol (e.g., AAPL). Use this for single symbol.",
              schema: {
                type: "string",
              },
              example: "AAPL",
            },
            {
              name: "symbols",
              in: "query",
              required: false,
              description: "Comma-separated list of stock ticker symbols (e.g., AAPL,MSFT,GOOGL). Use this for multiple symbols. Maximum 10 symbols.",
              schema: {
                type: "string",
              },
              example: "AAPL,MSFT",
            },
            {
              name: "from",
              in: "query",
              required: false,
              description: "Start date for news filtering (YYYY-MM-DD format)",
              schema: {
                type: "string",
                format: "date",
              },
              example: "2025-01-01",
            },
            {
              name: "to",
              in: "query",
              required: false,
              description: "End date for news filtering (YYYY-MM-DD format)",
              schema: {
                type: "string",
                format: "date",
              },
              example: "2025-01-31",
            },
            {
              name: "page",
              in: "query",
              required: false,
              description: "Page number (0-based). Default: 0",
              schema: {
                type: "integer",
                minimum: 0,
                default: 0,
              },
              example: 0,
            },
            {
              name: "limit",
              in: "query",
              required: false,
              description: "Number of results per page (1-250). Default: 20. Maximum: 250",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 250,
                default: 20,
              },
              example: 20,
            },
          ],
          responses: {
            "200": {
              description: "Successful response with news articles",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/StockNewsResponse",
                  },
                  example: {
                    symbols: ["AAPL"],
                    news: [
                      {
                        title: "Apple Announces New Product",
                        text: "Apple has announced a new product line...",
                        url: "https://example.com/news",
                        publishedDate: "2024-01-20T10:00:00Z",
                        image: "https://example.com/image.jpg",
                        site: "TechCrunch",
                        type: "news",
                      },
                    ],
                    pagination: {
                      page: 0,
                      limit: 20,
                      total: 100,
                      hasMore: true,
                    },
                    cached: false,
                  },
                },
              },
            },
            "400": {
              description: "Bad request - symbol or symbols parameter required, invalid format, or too many symbols",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  examples: {
                    missingSymbol: {
                      value: {
                        error: "symbol or symbols parameter required",
                      },
                    },
                    tooManySymbols: {
                      value: {
                        error: "maximum 10 symbols allowed",
                      },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/get-stock-details": {
        get: {
          summary: "Get comprehensive stock details",
          description: "Fetches comprehensive stock information including profile, quote, historical chart data, financials, news, and more. Aggregates data from multiple FMP endpoints into a unified response.",
          tags: ["Stock Quotes"],
          parameters: [
            {
              name: "symbol",
              in: "query",
              required: true,
              description: "Stock ticker symbol (e.g., AAPL, AMZN)",
              schema: {
                type: "string",
                maxLength: 10,
              },
              example: "AMZN",
            },
          ],
          responses: {
            "200": {
              description: "Successful response with comprehensive stock details",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/StockDetails",
                  },
                  example: {
                    symbol: "AMZN",
                    profile: {
                      companyName: "Amazon.com Inc.",
                      industry: "E-Commerce",
                      sector: "Consumer Cyclical",
                      description: "Amazon.com Inc. is a multinational technology company...",
                      website: "https://www.amazon.com",
                      image: "https://images.financialmodelingprep.com/symbol/AMZN.png",
                    },
                    quote: {
                      price: 150.25,
                      change: 2.5,
                      changesPercentage: 1.69,
                      dayHigh: 152.0,
                      dayLow: 148.5,
                      open: 149.0,
                      previousClose: 147.75,
                      volume: 50000000,
                      marketCap: 1500000000000,
                    },
                    chart: {
                      "1D": [{ date: "2024-01-20", price: 150.25, volume: 50000000 }],
                      "1W": [{ date: "2024-01-15", price: 148.0, volume: 48000000 }],
                      "1M": [],
                      "3M": [],
                      "1Y": [],
                      "ALL": [],
                    },
                    financials: {
                      income: [
                        {
                          date: "2024-01-01",
                          revenue: 1000000000,
                          netIncome: 200000000,
                          eps: 5.5,
                        },
                      ],
                      keyMetrics: [
                        {
                          date: "2024-01-01",
                          peRatio: 25,
                          priceToBook: 5,
                        },
                      ],
                      ratios: [
                        {
                          date: "2024-01-01",
                          currentRatio: 2.5,
                          debtToEquity: 1.2,
                        },
                      ],
                    },
                    news: [
                      {
                        title: "Amazon Announces New Service",
                        text: "Amazon has announced a new service...",
                        url: "https://example.com/news",
                        publishedDate: "2024-01-20",
                        image: "https://example.com/image.jpg",
                      },
                    ],
                    peers: [],
                    partial: false,
                    cached: false,
                    refreshedAt: 1705780800000,
                  },
                },
              },
            },
            "400": {
              description: "Bad request - symbol parameter required or invalid format",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  examples: {
                    missingSymbol: {
                      value: {
                        error: "symbol required",
                      },
                    },
                    invalidFormat: {
                      value: {
                        error: "invalid symbol format",
                      },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Server error - failed to fetch stock details",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  example: {
                    error: "Failed to fetch stock details",
                    symbol: "AMZN",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/get-historical": {
        get: {
          summary: "Get historical price data",
          description:
            "Retrieves historical price data for a stock symbol. Supports date range filtering via 'from' and 'to' parameters, or backward-compatible 'days' parameter. Data is fetched from the D1 database which is populated by the get-stock endpoint. If database is empty, automatically fetches from FMP API.",
          tags: ["Historical Prices"],
          parameters: [
            {
              name: "symbol",
              in: "query",
              required: true,
              description: "Stock ticker symbol (e.g., AAPL, MSFT)",
              schema: {
                type: "string",
              },
              example: "AMZN",
            },
            {
              name: "from",
              in: "query",
              required: false,
              description: "Start date in YYYY-MM-DD format (inclusive). If provided with 'to', overrides 'days' parameter.",
              schema: {
                type: "string",
                format: "date",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              },
              example: "2025-01-01",
            },
            {
              name: "to",
              in: "query",
              required: false,
              description: "End date in YYYY-MM-DD format (inclusive). Defaults to today if 'from' is provided without 'to'.",
              schema: {
                type: "string",
                format: "date",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              },
              example: "2025-01-31",
            },
            {
              name: "days",
              in: "query",
              required: false,
              description: "Number of days to look back from today (default: 180, max: 3650). Ignored if 'from' parameter is provided.",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 3650,
                default: 180,
              },
              example: 180,
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/HistoricalPricesResponse",
                  },
                  examples: {
                    withDays: {
                      value: {
                        symbol: "AMZN",
                        days: 180,
                        data: [
                          { date: "2025-01-01", price: 120.55, volume: 12345678, open: 120.00, high: 121.50, low: 119.80, close: 120.55 },
                          { date: "2025-01-02", price: 121.20, volume: 14567890, open: 120.55, high: 122.00, low: 120.20, close: 121.20 },
                        ],
                      },
                    },
                    withDateRange: {
                      value: {
                        symbol: "AMZN",
                        from: "2025-01-01",
                        to: "2025-01-31",
                        data: [
                          { date: "2025-01-01", price: 120.55, volume: 12345678, open: 120.00, high: 121.50, low: 119.80, close: 120.55 },
                          { date: "2025-01-02", price: 121.20, volume: 14567890, open: 120.55, high: 122.00, low: 120.20, close: 121.20 },
                        ],
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Validation error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  examples: {
                    missingSymbol: {
                      value: {
                        error: "symbol parameter is required",
                      },
                    },
                    invalidDays: {
                      value: {
                        error: "days parameter must be a positive number between 1 and 3650",
                      },
                    },
                    invalidFromDate: {
                      value: {
                        error: "Invalid 'from' date format (expected YYYY-MM-DD)",
                      },
                    },
                    invalidToDate: {
                      value: {
                        error: "Invalid 'to' date format (expected YYYY-MM-DD)",
                      },
                    },
                    invalidDateRange: {
                      value: {
                        error: "'from' date must be before or equal to 'to' date",
                      },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  example: {
                    error: "failed to fetch historical prices",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/simulate-provider-failure": {
        post: {
          summary: "Enable provider failure simulation",
          description:
            "Enables simulation mode that makes the API return stale cached data instead of calling external providers. Useful for testing fallback behavior.",
          tags: ["Admin"],
          responses: {
            "200": {
              description: "Simulation enabled successfully",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AdminConfig",
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/disable-provider-failure": {
        post: {
          summary: "Disable provider failure simulation",
          description:
            "Disables simulation mode and restores normal provider calls.",
          tags: ["Admin"],
          responses: {
            "200": {
              description: "Simulation disabled successfully",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AdminConfig",
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/config/get": {
        get: {
          summary: "Get admin configuration",
          description: "Retrieves the current admin configuration including feature flags.",
          tags: ["Admin"],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AdminConfig",
                  },
                },
              },
            },
          },
        },
      },
      "/config/update": {
        post: {
          summary: "Update admin configuration",
          description: "Updates admin configuration with provided values.",
          tags: ["Admin"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminConfigUpdate",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Configuration updated successfully",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AdminConfig",
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/alerts": {
        get: {
          summary: "List all alerts",
          description: "Returns all configured price alerts",
          tags: ["Alerts"],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      alerts: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/Alert",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "Create new alert",
          description: "Creates a new price alert",
          tags: ["Alerts"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateAlertRequest",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Alert created successfully",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Alert",
                  },
                },
              },
            },
          },
        },
      },
      "/v1/api/alerts/{id}": {
        get: {
          summary: "Get alert by ID",
          tags: ["Alerts"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Alert",
                  },
                },
              },
            },
          },
        },
        put: {
          summary: "Update alert",
          tags: ["Alerts"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateAlertRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Alert updated successfully",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Alert",
                  },
                },
              },
            },
          },
        },
        delete: {
          summary: "Delete alert",
          tags: ["Alerts"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            "200": {
              description: "Alert deleted successfully",
            },
          },
        },
      },
    },
    components: {
      schemas: {
        HistoricalPricesResponse: {
          type: "object",
          required: ["symbol", "data"],
          properties: {
            symbol: {
              type: "string",
              description: "Stock ticker symbol (uppercased)",
              example: "AMZN",
            },
            days: {
              type: "integer",
              nullable: true,
              description: "Number of days requested (only present if 'days' parameter was used)",
              example: 180,
            },
            from: {
              type: "string",
              format: "date",
              nullable: true,
              description: "Start date in YYYY-MM-DD format (only present if 'from' parameter was used)",
              example: "2025-01-01",
            },
            to: {
              type: "string",
              format: "date",
              nullable: true,
              description: "End date in YYYY-MM-DD format (only present if date range parameters were used)",
              example: "2025-01-31",
            },
            data: {
              type: "array",
              description:
                "Array of historical price records, ordered by date (ascending). Empty array if no data available.",
              items: {
                $ref: "#/components/schemas/HistoricalPriceRecord",
              },
            },
          },
        },
        HistoricalPriceRecord: {
          type: "object",
          required: ["date", "price"],
          properties: {
            date: {
              type: "string",
              format: "date",
              description: "Date in YYYY-MM-DD format",
              example: "2025-01-01",
            },
            price: {
              type: "number",
              format: "double",
              description: "Closing price for the date (alias: same as 'close')",
              example: 120.55,
            },
            close: {
              type: "number",
              format: "double",
              nullable: true,
              description: "Closing price for the date (same as 'price', kept for clarity)",
              example: 120.55,
            },
            volume: {
              type: "integer",
              nullable: true,
              description: "Trading volume for the date (may be null if unavailable)",
              example: 12345678,
            },
            open: {
              type: "number",
              format: "double",
              nullable: true,
              description: "Opening price for the date (null if OHLC data unavailable)",
              example: 119.50,
            },
            high: {
              type: "number",
              format: "double",
              nullable: true,
              description: "Highest price for the date (null if OHLC data unavailable)",
              example: 121.00,
            },
            low: {
              type: "number",
              format: "double",
              nullable: true,
              description: "Lowest price for the date (null if OHLC data unavailable)",
              example: 119.00,
            },
          },
        },
        StockDetails: {
          type: "object",
          required: ["symbol", "profile", "quote", "chart", "financials", "news", "peers"],
          properties: {
            symbol: {
              type: "string",
              description: "Stock ticker symbol",
              example: "AMZN",
            },
            profile: {
              type: "object",
              required: ["companyName", "industry", "sector", "description", "website", "image"],
              properties: {
                companyName: { type: "string", example: "Amazon.com Inc." },
                industry: { type: "string", example: "E-Commerce" },
                sector: { type: "string", example: "Consumer Cyclical" },
                description: { type: "string", example: "Amazon.com Inc. is a multinational technology company..." },
                website: { type: "string", example: "https://www.amazon.com" },
                image: { type: "string", example: "https://images.financialmodelingprep.com/symbol/AMZN.png" },
              },
            },
            quote: {
              type: "object",
              required: ["price", "change", "changesPercentage", "dayHigh", "dayLow", "open", "previousClose", "volume", "marketCap"],
              properties: {
                price: { type: "number", example: 150.25 },
                change: { type: "number", example: 2.5 },
                changesPercentage: { type: "number", example: 1.69 },
                dayHigh: { type: "number", example: 152.0 },
                dayLow: { type: "number", example: 148.5 },
                open: { type: "number", example: 149.0 },
                previousClose: { type: "number", example: 147.75 },
                volume: { type: "integer", example: 50000000 },
                marketCap: { type: "integer", example: 1500000000000 },
              },
            },
            chart: {
              type: "object",
              required: ["1D", "1W", "1M", "3M", "1Y", "ALL"],
              properties: {
                "1D": {
                  type: "array",
                  items: { $ref: "#/components/schemas/ChartDataPoint" },
                },
                "1W": {
                  type: "array",
                  items: { $ref: "#/components/schemas/ChartDataPoint" },
                },
                "1M": {
                  type: "array",
                  items: { $ref: "#/components/schemas/ChartDataPoint" },
                },
                "3M": {
                  type: "array",
                  items: { $ref: "#/components/schemas/ChartDataPoint" },
                },
                "1Y": {
                  type: "array",
                  items: { $ref: "#/components/schemas/ChartDataPoint" },
                },
                "ALL": {
                  type: "array",
                  items: { $ref: "#/components/schemas/ChartDataPoint" },
                },
              },
            },
            financials: {
              type: "object",
              required: ["income", "keyMetrics", "ratios"],
              properties: {
                income: {
                  type: "array",
                  items: { $ref: "#/components/schemas/IncomeStatement" },
                },
                keyMetrics: {
                  type: "array",
                  items: { $ref: "#/components/schemas/KeyMetric" },
                },
                ratios: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FinancialRatio" },
                },
              },
            },
            news: {
              type: "array",
              items: { $ref: "#/components/schemas/StockNews" },
            },
            peers: {
              type: "array",
              items: { $ref: "#/components/schemas/StockPeer" },
            },
            partial: {
              type: "boolean",
              description: "true if some data failed to fetch",
              example: false,
            },
            cached: {
              type: "boolean",
              description: "true if served from cache",
              example: false,
            },
            refreshedAt: {
              type: "integer",
              description: "timestamp when data was fetched",
              example: 1705780800000,
            },
          },
        },
        ChartDataPoint: {
          type: "object",
          required: ["date", "price"],
          properties: {
            date: { type: "string", format: "date", example: "2024-01-20" },
            price: { type: "number", example: 150.25 },
            volume: { type: "integer", nullable: true, example: 50000000 },
          },
        },
        IncomeStatement: {
          type: "object",
          required: ["date"],
          properties: {
            date: { type: "string", example: "2024-01-01" },
            revenue: { type: "number", nullable: true, example: 1000000 },
            netIncome: { type: "number", nullable: true, example: 200000 },
            eps: { type: "number", nullable: true, example: 5.5 },
          },
        },
        KeyMetric: {
          type: "object",
          required: ["date"],
          properties: {
            date: { type: "string", example: "2024-01-01" },
            peRatio: { type: "number", nullable: true, example: 25 },
            priceToBook: { type: "number", nullable: true, example: 5 },
          },
        },
        FinancialRatio: {
          type: "object",
          required: ["date"],
          properties: {
            date: { type: "string", example: "2024-01-01" },
            currentRatio: { type: "number", nullable: true, example: 2.5 },
            debtToEquity: { type: "number", nullable: true, example: 1.2 },
          },
        },
        StockNews: {
          type: "object",
          required: ["title", "text", "url", "publishedDate"],
          properties: {
            title: { type: "string", example: "Amazon Announces New Service" },
            text: { type: "string", example: "Amazon has announced a new service..." },
            url: { type: "string", example: "https://example.com/news" },
            publishedDate: { type: "string", example: "2024-01-20" },
            image: { type: "string", nullable: true, example: "https://example.com/image.jpg" },
          },
        },
        StockPeer: {
          type: "object",
          required: ["symbol", "name"],
          properties: {
            symbol: { type: "string", example: "AAPL" },
            name: { type: "string", example: "Apple Inc." },
            price: { type: "number", nullable: true, example: 150.25 },
          },
        },
        MarketStockItem: {
          type: "object",
          required: ["symbol", "name", "price"],
          properties: {
            symbol: {
              type: "string",
              description: "Stock ticker symbol",
              example: "AAPL",
            },
            name: {
              type: "string",
              description: "Company name",
              example: "Apple Inc.",
            },
            price: {
              type: "number",
              description: "Current stock price",
              example: 150.0,
            },
            change: {
              type: "number",
              nullable: true,
              description: "Price change from previous close",
              example: 1.5,
            },
            changesPercentage: {
              type: "number",
              nullable: true,
              description: "Percentage change from previous close",
              example: 1.0,
            },
            volume: {
              type: "number",
              nullable: true,
              description: "Trading volume",
              example: 1000000,
            },
            dayLow: {
              type: "number",
              nullable: true,
              description: "Lowest price of the day",
              example: 149.0,
            },
            dayHigh: {
              type: "number",
              nullable: true,
              description: "Highest price of the day",
              example: 152.0,
            },
            marketCap: {
              type: "number",
              nullable: true,
              description: "Market capitalization",
              example: 2500000000000,
            },
            exchange: {
              type: "string",
              nullable: true,
              description: "Stock exchange",
              example: "NASDAQ",
            },
            exchangeShortName: {
              type: "string",
              nullable: true,
              description: "Short exchange name",
              example: "NASDAQ",
            },
            type: {
              type: "string",
              nullable: true,
              description: "Security type",
              example: "stock",
            },
          },
        },
        StockNewsResponse: {
          type: "object",
          required: ["symbols", "news", "pagination"],
          properties: {
            symbols: {
              type: "array",
              items: { type: "string" },
              description: "Array of stock ticker symbols requested",
              example: ["AAPL"],
            },
            news: {
              type: "array",
              description: "Array of news articles (combined from all requested symbols)",
              items: { $ref: "#/components/schemas/StockNews" },
            },
            pagination: {
              type: "object",
              required: ["page", "limit", "total"],
              properties: {
                page: {
                  type: "integer",
                  description: "Current page number (0-based)",
                  example: 0,
                },
                limit: {
                  type: "integer",
                  description: "Number of results per page",
                  example: 20,
                },
                total: {
                  type: "integer",
                  description: "Total number of news articles returned in this response",
                  example: 20,
                },
                hasMore: {
                  type: "boolean",
                  description: "Whether there are more pages available (estimated)",
                  example: true,
                },
              },
            },
            cached: {
              type: "boolean",
              description: "Whether the response was served from cache",
              example: false,
            },
            partial: {
              type: "boolean",
              description: "true if API fetch failed but empty array returned gracefully",
              example: false,
            },
            error: {
              type: "string",
              nullable: true,
              description: "Error message if fetch failed (still returns 200 status)",
            },
            stale_reason: {
              type: "string",
              nullable: true,
              description: "Reason for stale data: 'simulation_mode', 'provider_api_error', 'provider_network_error', etc.",
            },
          },
        },
        StockNewsItem: {
          type: "object",
          required: ["title", "text", "url", "publishedDate"],
          properties: {
            title: { type: "string", example: "Apple Announces New Product" },
            text: { type: "string", example: "Apple has announced a new product line..." },
            url: { type: "string", example: "https://example.com/news" },
            publishedDate: { type: "string", example: "2024-01-20T10:00:00Z" },
            image: { type: "string", nullable: true, example: "https://example.com/image.jpg" },
            site: { type: "string", example: "TechCrunch", description: "News source/site name" },
            type: { type: "string", example: "news", description: "Type of content" },
          },
        },
        Alert: {
          type: "object",
          required: [
            "id",
            "symbol",
            "direction",
            "threshold",
            "status",
            "channel",
            "target",
            "createdAt",
            "updatedAt",
          ],
          properties: {
            id: {
              type: "string",
              format: "uuid",
            },
            symbol: {
              type: "string",
            },
            direction: {
              type: "string",
              enum: ["above", "below"],
            },
            threshold: {
              type: "number",
            },
            status: {
              type: "string",
              enum: ["active", "paused"],
            },
            channel: {
              type: "string",
              enum: ["email", "webhook", "notification"],
            },
            target: {
              type: "string",
            },
            notes: {
              type: "string",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        CreateAlertRequest: {
          type: "object",
          required: ["symbol", "direction", "threshold", "channel", "target"],
          properties: {
            symbol: {
              type: "string",
            },
            direction: {
              type: "string",
              enum: ["above", "below"],
            },
            threshold: {
              type: "number",
            },
            channel: {
              type: "string",
              enum: ["email", "webhook", "notification"],
            },
            target: {
              type: "string",
            },
            notes: {
              type: "string",
            },
          },
        },
        UpdateAlertRequest: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
            },
            direction: {
              type: "string",
              enum: ["above", "below"],
            },
            threshold: {
              type: "number",
            },
            status: {
              type: "string",
              enum: ["active", "paused"],
            },
            channel: {
              type: "string",
              enum: ["email", "webhook", "notification"],
            },
            target: {
              type: "string",
            },
            notes: {
              type: "string",
              nullable: true,
            },
          },
        },
        ErrorResponse: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "string",
              description: "Human-readable error message",
              example: "error message",
            },
          },
        },
        AdminConfig: {
          type: "object",
          required: ["pollingIntervalSec", "kvWriteIntervalSec", "primaryProvider", "backupProvider", "alertThrottle", "featureFlags"],
          properties: {
            pollingIntervalSec: {
              type: "integer",
              description: "Price polling interval in seconds",
              example: 30,
            },
            kvWriteIntervalSec: {
              type: "integer",
              description: "KV write interval in seconds (how often alert states are flushed to KV)",
              example: 3600,
            },
            primaryProvider: {
              type: "string",
              description: "Primary quote provider",
              example: "alpha-feed",
            },
            backupProvider: {
              type: "string",
              description: "Backup quote provider",
              example: "beta-feed",
            },
            alertThrottle: {
              type: "object",
              required: ["maxAlerts", "windowSeconds"],
              properties: {
                maxAlerts: {
                  type: "integer",
                  example: 100,
                },
                windowSeconds: {
                  type: "integer",
                  example: 60,
                },
              },
            },
            featureFlags: {
              type: "object",
              required: ["alerting", "sandboxMode", "simulateProviderFailure"],
              properties: {
                alerting: {
                  type: "boolean",
                  example: true,
                },
                sandboxMode: {
                  type: "boolean",
                  example: false,
                },
                simulateProviderFailure: {
                  type: "boolean",
                  description: "When enabled, API returns stale cached data instead of calling external providers",
                  example: false,
                },
              },
            },
          },
        },
        AdminConfigUpdate: {
          type: "object",
          properties: {
            pollingIntervalSec: { type: "integer" },
            kvWriteIntervalSec: { type: "integer", description: "KV write interval in seconds (how often alert states are flushed to KV)" },
            primaryProvider: { type: "string" },
            backupProvider: { type: "string" },
            alertThrottle: {
              type: "object",
              properties: {
                maxAlerts: { type: "integer" },
                windowSeconds: { type: "integer" },
              },
            },
            featureFlags: {
              type: "object",
              properties: {
                alerting: { type: "boolean" },
                sandboxMode: { type: "boolean" },
                simulateProviderFailure: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  };

  return json(spec);
}

