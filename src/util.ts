export const API_KEY = "z5xjUUlsab7zBKntL5QnMzWyPuq2iWsM";
export const API_URL = "https://financialmodelingprep.com/stable";

/**
 * Get allowed origin for CORS
 * Supports credentials by checking specific origins
 */
function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  
  if (!origin) {
    return null;
  }

  // Allow specific origins
  const allowedOrigins = [
    "https://stockly-webapp.pages.dev",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
  ];

  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  // For development, allow localhost with any port
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
    return origin;
  }

  return null;
}

/**
 * Get CORS headers with dynamic origin support
 */
export function getCorsHeaders(request: Request): HeadersInit {
  const origin = getAllowedOrigin(request);
  const allowCredentials = origin !== null;

  const headers: HeadersInit = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With, Origin, Referer, User-Agent, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    // Fallback to * if no origin (for non-browser requests)
    headers["Access-Control-Allow-Origin"] = "*";
  }

  if (allowCredentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

// Legacy CORS_HEADERS for backward compatibility (without credentials)
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With, Origin, Referer, User-Agent, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export const json = (data: unknown, status = 200, request?: Request): Response => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Use dynamic CORS headers if request is provided (for credentials support)
  if (request) {
    Object.assign(headers, getCorsHeaders(request));
  } else {
    Object.assign(headers, CORS_HEADERS);
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
};
