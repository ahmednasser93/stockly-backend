/**
 * JWT Token Management Utilities
 * 
 * Handles generation and verification of JWT access and refresh tokens
 */

import { SignJWT, jwtVerify, JWTPayload } from "jose";

export interface TokenPayload extends JWTPayload {
  username: string;
  type: "access" | "refresh";
}

/**
 * Generate JWT access token
 * @param username - Username (unique identifier for the user)
 * @param secret - JWT secret from environment
 * @param expiresIn - Token expiration time (default: 15 minutes)
 * @returns JWT access token string
 */
export async function generateAccessToken(
  username: string,
  secret: string,
  expiresIn: string = "15m"
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  const token = await new SignJWT({ username, type: "access" } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setSubject(username)
    .sign(secretKey);

  return token;
}

/**
 * Generate JWT refresh token
 * @param username - Username (unique identifier for the user)
 * @param secret - JWT refresh secret from environment
 * @param expiresIn - Token expiration time (default: 7 days)
 * @returns JWT refresh token string
 */
export async function generateRefreshToken(
  username: string,
  secret: string,
  expiresIn: string = "7d"
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  const token = await new SignJWT({ username, type: "refresh" } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setSubject(username)
    .sign(secretKey);

  return token;
}

/**
 * Verify JWT token and extract payload
 * @param token - JWT token string
 * @param secret - JWT secret from environment
 * @returns Token payload with username if valid, null if invalid
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<{ username: string; type: "access" | "refresh" } | null> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify<TokenPayload>(token, secretKey);

    // Verify token type is present
    if (!payload.username || !payload.type) {
      return null;
    }

    // Verify token type is valid
    if (payload.type !== "access" && payload.type !== "refresh") {
      return null;
    }

    return {
      username: payload.username,
      type: payload.type,
    };
  } catch (error) {
    // Token is invalid, expired, or malformed
    return null;
  }
}

/**
 * Extract username from JWT token without full verification
 * Useful for logging or non-critical operations
 * @param token - JWT token string
 * @returns username if token is parseable, null otherwise
 */
export function extractUsernameFromToken(token: string): string | null {
  try {
    // Decode without verification (just for extracting username)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0))
      )
    );

    return payload.username || null;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use extractUsernameFromToken instead
 * Legacy function for backward compatibility during migration
 */
export function extractUserIdFromToken(token: string): string | null {
  return extractUsernameFromToken(token);
}
