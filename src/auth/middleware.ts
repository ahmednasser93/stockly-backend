/**
 * Authentication Middleware
 * 
 * Extracts and validates JWT tokens from requests
 * Supports both Authorization header (mobile) and httpOnly cookies (webapp)
 */

import { verifyToken } from "./jwt";

// D1Database type from Cloudflare Workers
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1ExecResult>;
}

interface D1Result<T> {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    size_after: number;
    rows_read: number;
    rows_written: number;
  };
}

interface D1ExecResult {
  success: boolean;
  meta: {
    duration: number;
    size_after: number;
    rows_read: number;
    rows_written: number;
    last_row_id: number;
    changes: number;
  };
}

export interface AuthResult {
  userId: string;
  tokenType: "access" | "refresh";
}

export interface AuthWithAdmin extends AuthResult {
  isAdmin: boolean;
}

/**
 * Authenticate request by extracting and validating JWT token
 * Checks both Authorization header and httpOnly cookies
 * 
 * @param request - HTTP request
 * @param accessTokenSecret - JWT access token secret
 * @param refreshTokenSecret - JWT refresh token secret (optional, for refresh endpoint)
 * @returns Auth result with userId if valid, null if invalid/missing
 */
export async function authenticateRequest(
  request: Request,
  accessTokenSecret: string,
  refreshTokenSecret?: string
): Promise<AuthResult | null> {
  // Try to get token from Authorization header first (mobile app)
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const result = await verifyToken(token, accessTokenSecret);
    
    if (result && result.type === "access") {
      return {
        userId: result.userId,
        tokenType: "access",
      };
    }
    
    // If access token fails, try refresh token if secret provided
    if (refreshTokenSecret) {
      const refreshResult = await verifyToken(token, refreshTokenSecret);
      if (refreshResult && refreshResult.type === "refresh") {
        return {
          userId: refreshResult.userId,
          tokenType: "refresh",
        };
      }
    }
  }

  // Try to get token from httpOnly cookie (webapp)
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    
    // Check for access token cookie
    if (cookies.accessToken) {
      const result = await verifyToken(cookies.accessToken, accessTokenSecret);
      if (result && result.type === "access") {
        return {
          userId: result.userId,
          tokenType: "access",
        };
      }
    }
    
    // Check for refresh token cookie if access token fails and secret provided
    if (refreshTokenSecret && cookies.refreshToken) {
      const result = await verifyToken(cookies.refreshToken, refreshTokenSecret);
      if (result && result.type === "refresh") {
        return {
          userId: result.userId,
          tokenType: "refresh",
        };
      }
    }
  }

  return null;
}

/**
 * Check if a user is admin based on username
 * Admin username: "sngvahmed"
 * 
 * @param env - Environment with database access
 * @param userId - User ID to check
 * @returns true if user is admin, false otherwise
 */
export async function isAdmin(env: { stockly: D1Database }, userId: string): Promise<boolean> {
  try {
    const user = await env.stockly
      .prepare("SELECT username FROM users WHERE id = ?")
      .bind(userId)
      .first<{ username: string | null }>();
    
    return user?.username === "sngvahmed";
  } catch (error) {
    console.error("Failed to check admin status", error);
    return false;
  }
}

/**
 * Authenticate request and check admin status
 * Returns auth result with admin flag
 * 
 * @param request - HTTP request
 * @param env - Environment with database access
 * @param accessTokenSecret - JWT access token secret
 * @param refreshTokenSecret - JWT refresh token secret (optional)
 * @returns Auth result with userId and isAdmin flag if valid, null if invalid/missing
 */
export async function authenticateRequestWithAdmin(
  request: Request,
  env: { stockly: D1Database },
  accessTokenSecret: string,
  refreshTokenSecret?: string
): Promise<AuthWithAdmin | null> {
  const auth = await authenticateRequest(request, accessTokenSecret, refreshTokenSecret);
  
  if (!auth) {
    return null;
  }
  
  const adminStatus = await isAdmin(env, auth.userId);
  
  return {
    ...auth,
    isAdmin: adminStatus,
  };
}

/**
 * Parse cookie header string into object
 * @param cookieHeader - Cookie header string
 * @returns Object with cookie name-value pairs
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  cookieHeader.split(";").forEach((cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  
  return cookies;
}

/**
 * Set httpOnly cookie in response
 * @param response - Response object to modify
 * @param name - Cookie name
 * @param value - Cookie value
 * @param maxAge - Max age in seconds (default: 7 days for refresh, 15 minutes for access)
 * @returns Modified response
 */
export function setHttpOnlyCookie(
  response: Response,
  name: string,
  value: string,
  maxAge: number = 604800 // 7 days default
): Response {
  // Use SameSite=None for cross-site cookies (webapp and API on different domains)
  // Secure is required when SameSite=None (must be HTTPS)
  const cookie = `${name}=${value}; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}; Path=/`;
  
  // Clone response to add cookie header
  const newHeaders = new Headers(response.headers);
  const existingCookies = newHeaders.get("Set-Cookie");
  
  if (existingCookies) {
    newHeaders.set("Set-Cookie", `${existingCookies}, ${cookie}`);
  } else {
    newHeaders.set("Set-Cookie", cookie);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Clear httpOnly cookie (set expired)
 * @param response - Response object to modify
 * @param name - Cookie name
 * @returns Modified response
 */
export function clearHttpOnlyCookie(
  response: Response,
  name: string
): Response {
  // Use SameSite=None for cross-site cookies (webapp and API on different domains)
  // Secure is required when SameSite=None (must be HTTPS)
  const cookie = `${name}=; HttpOnly; Secure; SameSite=None; Max-Age=0; Path=/`;
  
  const newHeaders = new Headers(response.headers);
  const existingCookies = newHeaders.get("Set-Cookie");
  
  if (existingCookies) {
    newHeaders.set("Set-Cookie", `${existingCookies}, ${cookie}`);
  } else {
    newHeaders.set("Set-Cookie", cookie);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
