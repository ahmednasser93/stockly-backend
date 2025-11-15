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
        name: "Historical Prices",
        description: "Historical stock price data endpoints",
      },
      {
        name: "Alerts",
        description: "Price alert management endpoints",
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
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - symbol parameter required",
            },
            "404": {
              description: "Symbol not found",
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
      "/v1/api/get-historical": {
        get: {
          summary: "Get historical price data",
          description:
            "Retrieves historical price data for a stock symbol over a specified number of days. Data is fetched from the D1 database which is populated by the get-stock endpoint.",
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
              name: "days",
              in: "query",
              required: false,
              description: "Number of days to look back (default: 180, max: 3650)",
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
                  example: {
                    symbol: "AMZN",
                    days: 180,
                    data: [
                      { date: "2025-01-01", price: 120.55, volume: 12345678 },
                      { date: "2025-01-02", price: 121.20, volume: 14567890 },
                      { date: "2025-01-03", price: 119.85, volume: 11234567 },
                    ],
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
          required: ["symbol", "days", "data"],
          properties: {
            symbol: {
              type: "string",
              description: "Stock ticker symbol (uppercased)",
              example: "AMZN",
            },
            days: {
              type: "integer",
              description: "Number of days requested",
              example: 180,
            },
            data: {
              type: "array",
              description:
                "Array of historical price records, ordered by date (ascending)",
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
              description: "Closing price for the date",
              example: 120.55,
            },
            volume: {
              type: "integer",
              nullable: true,
              description: "Trading volume for the date (may be null if unavailable)",
              example: 12345678,
            },
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
      },
    },
  };

  return json(spec);
}

