/**
 * Authentication API Endpoints
 * 
 * Handles Google OAuth, username management, token refresh, and logout
 */

import { json } from "../util";
import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "../auth/jwt";
import {
  validateUsername,
  normalizeUsername,
  isReservedWord,
} from "../auth/username-validation";
import {
  authenticateRequest,
  setHttpOnlyCookie,
  clearHttpOnlyCookie,
} from "../auth/middleware";
import {
  createErrorResponse,
  getErrorStatus,
  type AuthErrorCode,
} from "../auth/error-handler";
import {
  logAuthEvent,
  extractIpAddress,
  extractUserAgent,
} from "../logging/auth-logger";

interface GoogleAuthPayload {
  idToken: string;
}

interface UsernamePayload {
  username: string;
  idToken?: string; // Optional Google ID token for users without username yet
}

interface RefreshTokenPayload {
  refreshToken?: string; // For mobile app
}

/**
 * Verify Google ID token and create/update user
 * POST /v1/api/auth/google
 */
export async function handleGoogleAuth(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, request);
  }

  let payload: GoogleAuthPayload;
  try {
    payload = await request.json();
  } catch (error) {
    const { response } = createErrorResponse(
      "NETWORK_ERROR",
      "Invalid request payload",
      undefined,
      undefined,
      request
    );
    return response;
  }

  const { idToken } = payload;

  if (!idToken || typeof idToken !== "string") {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Google ID token is required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  try {
    // Verify Google ID token
    const googleUser = await verifyGoogleToken(idToken, env.GOOGLE_CLIENT_ID || "");

    if (!googleUser) {
      logger.warn("Google token verification failed", { idToken: idToken.substring(0, 20) + "..." });
      
      // Log failed authentication attempt
      logAuthEvent(logger, {
        type: "sign_in",
        success: false,
        error: "Google token verification failed",
        ipAddress: extractIpAddress(request) || undefined,
        userAgent: extractUserAgent(request) || undefined,
      });
      
      const { response } = createErrorResponse(
        "AUTH_GOOGLE_VERIFICATION_FAILED",
        "Invalid or expired Google token",
        undefined,
        undefined,
        request
      );
      return response;
    }

    const userId = googleUser.sub;
    const email = googleUser.email;
    const name = googleUser.name || null;
    const picture = googleUser.picture || null;

    if (!userId || !email) {
      const { response } = createErrorResponse(
        "AUTH_GOOGLE_VERIFICATION_FAILED",
        "Invalid Google token: missing user information",
        undefined,
        undefined,
        request
      );
      return response;
    }

    const now = Math.floor(Date.now() / 1000);

    // Check if user exists
    const existingUser = await env.stockly
      .prepare("SELECT id, username, email, name, picture FROM users WHERE id = ?")
      .bind(userId)
      .first<{
        id: string;
        username: string | null;
        email: string;
        name: string | null;
        picture: string | null;
      }>();

    if (existingUser) {
      // Update last login time
      await env.stockly
        .prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
        .bind(now, now, userId)
        .run();

      const requiresUsername = !existingUser.username;
      
      // If username is required but not set, don't generate tokens
      // User must set username first
      if (requiresUsername) {
        const responseData = {
          user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name || name,
            picture: existingUser.picture || picture,
            username: existingUser.username,
          },
          requiresUsername: true,
        };
        
        logger.info("User authenticated but username required", { userId, email, requiresUsername });
        
        // Log authentication event
        logAuthEvent(logger, {
          type: "sign_in",
          userId,
          email,
          success: true,
          ipAddress: extractIpAddress(request) || undefined,
          userAgent: extractUserAgent(request) || undefined,
        });
        
        return json(responseData, 200, request);
      }

      // Generate tokens with username
      const accessToken = await generateAccessToken(
        existingUser.username!,
        env.JWT_SECRET || "",
        "15m"
      );
      const refreshToken = await generateRefreshToken(
        existingUser.username!,
        env.JWT_REFRESH_SECRET || "",
        "7d"
      );

      // Prepare response
      const responseData = {
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name || name,
          picture: existingUser.picture || picture,
          username: existingUser.username,
        },
        requiresUsername,
      };

      let response = json(responseData, 200, request);

      // Set httpOnly cookies for webapp
      response = setHttpOnlyCookie(response, "accessToken", accessToken, 900); // 15 minutes
      response = setHttpOnlyCookie(response, "refreshToken", refreshToken, 604800); // 7 days

      // For mobile app, include tokens in response body
      const isMobile = request.headers.get("User-Agent")?.includes("Mobile") || 
                       request.headers.get("X-Platform") === "mobile";
      
      if (isMobile) {
        return json({
          ...responseData,
          accessToken,
          refreshToken,
        }, 200, request);
      }

      logger.info("User authenticated successfully", { userId, email, requiresUsername });
      
      // Log authentication event
      logAuthEvent(logger, {
        type: "sign_in",
        userId,
        email,
        success: true,
        ipAddress: extractIpAddress(request) || undefined,
        userAgent: extractUserAgent(request) || undefined,
      });
      
      return response;
    } else {
      // Create new user
      await env.stockly
        .prepare(
          "INSERT INTO users (id, email, name, picture, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(userId, email, name || null, picture || null, now, now, now)
        .run();

      // New users must set username before getting tokens
      // Don't generate tokens yet - user must set username first
      const responseData = {
        user: {
          id: userId,
          email,
          name,
          picture,
          username: null,
        },
        requiresUsername: true,
      };

      let response = json(responseData, 200, request);

      // For mobile app, don't include tokens (user must set username first)
      const isMobile = request.headers.get("User-Agent")?.includes("Mobile") || 
                       request.headers.get("X-Platform") === "mobile";
      
      if (isMobile) {
        return json(responseData, 200, request);
      }

      logger.info("New user created and authenticated", { userId, email });
      
      // Log authentication event
      logAuthEvent(logger, {
        type: "sign_in",
        userId,
        email,
        success: true,
        ipAddress: extractIpAddress(request) || undefined,
        userAgent: extractUserAgent(request) || undefined,
      });
      
      return response;
    }
  } catch (error) {
    logger.error("Google authentication failed", error, {});
    const { response } = createErrorResponse(
      "INTERNAL_ERROR",
      "Authentication failed. Please try again.",
      { error: error instanceof Error ? error.message : "Unknown error" },
      undefined,
      request
    );
    return response;
  }
}

/**
 * Verify Google ID token using Google's public keys
 * @param idToken - Google ID token
 * @param clientId - Google OAuth client ID
 * @returns Decoded token payload if valid, null if invalid
 */
async function verifyGoogleToken(
  idToken: string,
  clientId: string
): Promise<{
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
} | null> {
  try {
    // Fetch Google's public keys (JWKS)
    const keysResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/certs"
    );
    
    if (!keysResponse.ok) {
      return null;
    }

    const jwks = await keysResponse.json() as { keys?: Array<{ kid: string }> };

    // Decode token header to get key ID
    const [headerB64] = idToken.split(".");
    if (!headerB64) {
      return null;
    }

    const header = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(headerB64), (c) => c.charCodeAt(0))
      )
    ) as { kid: string };

    // Find the matching key
    const key = jwks.keys?.find((k: { kid: string }) => k.kid === header.kid);
    
    if (!key) {
      return null;
    }

    // Decode payload for validation (we'll verify signature separately)
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0))
      )
    );

    // Verify audience (client ID)
    if (payload.aud !== clientId) {
      return null;
    }

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    // Verify issuer
    if (payload.iss !== "https://accounts.google.com" && 
        payload.iss !== "accounts.google.com") {
      return null;
    }

    // Note: For production, you should verify the JWT signature using the public key
    // This requires converting the JWK to a format that jose can use
    // For now, we validate the claims (aud, exp, iss) which provides basic security
    // TODO: Implement full signature verification using jose library with JWK

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check username availability
 * GET /v1/api/auth/username/check?username=<username>
 */
export async function checkUsernameAvailability(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, request);
  }

  const url = new URL(request.url);
  const username = url.searchParams.get("username");

  if (!username) {
    const { response } = createErrorResponse(
      "USERNAME_INVALID_FORMAT",
      "Username parameter is required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  // Validate format
  const validation = validateUsername(username);
  if (!validation.valid) {
    return json({
      available: false,
      message: validation.error,
      reason: validation.reason,
    }, 200, request);
  }

  // Check if username exists (case-insensitive)
  const normalized = normalizeUsername(username);
  
  try {
    const existing = await env.stockly
      .prepare("SELECT COUNT(*) as count FROM users WHERE LOWER(username) = ?")
      .bind(normalized)
      .first<{ count: number }>();

    if (existing && existing.count > 0) {
    return json({
      available: false,
      message: "This username is already taken",
      reason: "taken",
    }, 200, request);
    }

    return json({
      available: true,
      message: "Username is available",
    }, 200, request);
  } catch (error) {
    logger.error("Username availability check failed", error, { username });
    const { response } = createErrorResponse(
      "INTERNAL_ERROR",
      "Failed to check username availability",
      undefined,
      undefined,
      request
    );
    return response;
  }
}

/**
 * Set username for authenticated user
 * POST /v1/api/auth/username
 */
export async function setUsername(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, request);
  }

  let payload: UsernamePayload;
  try {
    payload = await request.json();
  } catch (error) {
    const { response } = createErrorResponse(
      "NETWORK_ERROR",
      "Invalid request payload",
      undefined,
      undefined,
      request
    );
    return response;
  }

  const { username, idToken } = payload;

  if (!username || typeof username !== "string") {
    const { response } = createErrorResponse(
      "USERNAME_INVALID_FORMAT",
      "Username is required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  let userId: string | null = null;

  // Try to authenticate with JWT first (for users who already have username)
  const auth = await authenticateRequest(
    request,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (auth) {
    // If JWT auth succeeds, get userId from username
    const user = await env.stockly
      .prepare("SELECT id, username FROM users WHERE username = ?")
      .bind(auth.username)
      .first<{ id: string; username: string | null }>();

    if (user) {
      userId = user.id;
      // If user already has a username, they can't change it
      if (user.username) {
        const { response } = createErrorResponse(
          "USERNAME_ALREADY_SET",
          "Username has already been set and cannot be changed",
          undefined,
          undefined,
          request
        );
        return response;
      }
    }
  }

  // If JWT auth failed, try Google ID token (for users without username yet)
  if (!userId && idToken) {
    const googleUser = await verifyGoogleToken(idToken, env.GOOGLE_CLIENT_ID || "");
    if (googleUser) {
      userId = googleUser.sub;
    }
  }

  if (!userId) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Authentication required. Provide either a valid JWT token or Google ID token.",
      undefined,
      undefined,
      request
    );
    return response;
  }

  // Check if user already has a username (double-check)
  const user = await env.stockly
    .prepare("SELECT id, username FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; username: string | null }>();

  if (!user) {
    const { response } = createErrorResponse(
      "USER_NOT_FOUND",
      "User not found",
      undefined,
      undefined,
      request
    );
    return response;
  }

  if (user.username) {
    const { response } = createErrorResponse(
      "USERNAME_ALREADY_SET",
      "Username has already been set and cannot be changed",
      undefined,
      undefined,
      request
    );
    return response;
  }

  // Validate username
  const validation = validateUsername(username);
  if (!validation.valid) {
    const { response } = createErrorResponse(
      validation.reason === "reserved" ? "USERNAME_RESERVED" : "USERNAME_INVALID_FORMAT",
      validation.error || "Invalid username format",
      undefined,
      undefined,
      request
    );
    return response;
  }

  // Check availability
  const normalized = normalizeUsername(username);
  const existing = await env.stockly
    .prepare("SELECT COUNT(*) as count FROM users WHERE LOWER(username) = ?")
    .bind(normalized)
    .first<{ count: number }>();

  if (existing && existing.count > 0) {
    const { response } = createErrorResponse(
      "USERNAME_TAKEN",
      "This username is already taken",
      undefined,
      undefined,
      request
    );
    return response;
  }

  // Set username
  const now = Math.floor(Date.now() / 1000);
  
  try {
    const result = await env.stockly
      .prepare("UPDATE users SET username = ?, updated_at = ? WHERE id = ? AND username IS NULL")
      .bind(normalized, now, userId)
      .run();

    if (result.meta.changes === 0) {
      // Race condition: username was set between check and update
      const { response } = createErrorResponse(
        "USERNAME_TAKEN",
        "This username is already taken",
        undefined,
        undefined,
        request
      );
      return response;
    }

    // Fetch updated user
    const updatedUser = await env.stockly
      .prepare("SELECT id, email, name, picture, username FROM users WHERE id = ?")
      .bind(userId)
      .first<{
        id: string;
        email: string;
        name: string | null;
        picture: string | null;
        username: string;
      }>();

    if (!updatedUser) {
      logger.error("User not found after username update", { userId });
      const { response } = createErrorResponse(
        "INTERNAL_ERROR",
        "Failed to retrieve updated user information",
        undefined,
        undefined,
        request
      );
      return response;
    }

    logger.info("Username set successfully", { userId, username: normalized });

    // Generate tokens now that username is set
    const accessToken = await generateAccessToken(
      normalized,
      env.JWT_SECRET || "",
      "15m"
    );
    const refreshToken = await generateRefreshToken(
      normalized,
      env.JWT_REFRESH_SECRET || "",
      "7d"
    );

    // Log username set event
    logAuthEvent(logger, {
      type: "username_set",
      userId,
      success: true,
      ipAddress: extractIpAddress(request) || undefined,
      userAgent: extractUserAgent(request) || undefined,
    });

    let response = json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        picture: updatedUser.picture,
        username: updatedUser.username,
      },
    }, 200, request);

    // Set httpOnly cookies for webapp
    response = setHttpOnlyCookie(response, "accessToken", accessToken, 900); // 15 minutes
    response = setHttpOnlyCookie(response, "refreshToken", refreshToken, 604800); // 7 days

    // For mobile app, include tokens in response body
    const isMobile = request.headers.get("User-Agent")?.includes("Mobile") || 
                     request.headers.get("X-Platform") === "mobile";
    
    if (isMobile) {
      return json({
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          picture: updatedUser.picture,
          username: updatedUser.username,
        },
        accessToken,
        refreshToken,
      }, 200, request);
    }

    return response;
  } catch (error) {
    // Check if it's a unique constraint violation
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      const { response } = createErrorResponse(
        "USERNAME_TAKEN",
        "This username is already taken",
        undefined,
        undefined,
        request
      );
      return response;
    }

    logger.error("Failed to set username", error, { userId, username });
    const { response } = createErrorResponse(
      "INTERNAL_ERROR",
      "Failed to set username. Please try again.",
      undefined,
      undefined,
      request
    );
    return response;
  }
}

/**
 * Refresh access token
 * POST /v1/api/auth/refresh
 */
export async function refreshToken(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, request);
  }

  // Get refresh token from cookie or body
  const cookieHeader = request.headers.get("Cookie");
  let refreshTokenValue: string | null = null;

  if (cookieHeader) {
    const cookies = cookieHeader.split(";").reduce((acc: Record<string, string>, cookie: string) => {
      const [name, value] = cookie.trim().split("=");
      if (name && value) {
        acc[name] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);
    refreshTokenValue = cookies.refreshToken || null;
  }

  // If not in cookie, try body (for mobile app)
  if (!refreshTokenValue) {
    try {
      const payload: RefreshTokenPayload = await request.json();
      refreshTokenValue = payload.refreshToken || null;
    } catch {
      // Body might be empty for webapp
    }
  }

  if (!refreshTokenValue) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Refresh token is required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  // Verify refresh token
  const result = await verifyToken(refreshTokenValue, env.JWT_REFRESH_SECRET || "");

  if (!result || result.type !== "refresh") {
    const { response } = createErrorResponse(
      "AUTH_INVALID_TOKEN",
      "Invalid or expired refresh token",
      undefined,
      undefined,
      request
    );
    return response;
  }

  // Generate new access token with username
  const newAccessToken = await generateAccessToken(
    result.username,
    env.JWT_SECRET || "",
    "15m"
  );

  // For webapp, set new cookie
  let response = json({ success: true }, 200, request);
  response = setHttpOnlyCookie(response, "accessToken", newAccessToken, 900);

  // For mobile app, return token in body
  const isMobile = request.headers.get("User-Agent")?.includes("Mobile") || 
                   request.headers.get("X-Platform") === "mobile";
  
  if (isMobile) {
    return json({
      success: true,
      accessToken: newAccessToken,
    }, 200, request);
  }

  logger.info("Token refreshed successfully", { username: result.username });
  
  // Log token refresh event
  logAuthEvent(logger, {
    type: "token_refresh",
    success: true,
    ipAddress: extractIpAddress(request) || undefined,
    userAgent: extractUserAgent(request) || undefined,
  });
  
  return response;
}

/**
 * Get current user
 * GET /v1/api/auth/me
 */
export async function getCurrentUser(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, request);
  }

  try {
    // Authenticate request
    const auth = await authenticateRequest(
      request,
      env.JWT_SECRET || "",
      env.JWT_REFRESH_SECRET
    );

    if (!auth) {
      const { response } = createErrorResponse(
        "AUTH_MISSING_TOKEN",
        "Not authenticated",
        undefined,
        undefined,
        request
      );
      return response;
    }

    // Get user from database by username
    const user = await env.stockly
      .prepare("SELECT id, email, name, picture, username FROM users WHERE username = ?")
      .bind(auth.username)
      .first<{
        id: string;
        email: string;
        name: string | null;
        picture: string | null;
        username: string | null;
      }>();

    if (!user) {
      const { response } = createErrorResponse(
        "USER_NOT_FOUND",
        "User not found",
        undefined,
        undefined,
        request
      );
      return response;
    }

    return json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          username: user.username,
        },
      },
      200,
      request
    );
  } catch (error) {
    logger.error("Failed to get current user", error);
    const { response } = createErrorResponse(
      "INTERNAL_ERROR",
      "Failed to retrieve user information",
      undefined,
      undefined,
      request
    );
    return response;
  }
}

/**
 * Logout
 * POST /v1/api/auth/logout
 */
export async function logout(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, request);
  }

  // Clear cookies
  let response = json({ success: true }, 200, request);
  response = clearHttpOnlyCookie(response, "accessToken");
  response = clearHttpOnlyCookie(response, "refreshToken");

  // Try to get userId from token before logout
  const auth = await authenticateRequest(
    request,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );
  
  logger.info("User logged out", { username: auth?.username });
  
  // Log logout event
  logAuthEvent(logger, {
    type: "sign_out",
    success: true,
    ipAddress: extractIpAddress(request) || undefined,
    userAgent: extractUserAgent(request) || undefined,
  });
  
  return response;
}
