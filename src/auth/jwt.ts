/**
 * JWT Token Management Utilities
 * 
 * Handles generation and verification of JWT access and refresh tokens
 */

import { SignJWT, jwtVerify, JWTPayload } from "jose";

export interface TokenPayload extends JWTPayload {
  userId: string;
  type: "access" | "refresh";
}

/**
 * Generate JWT access token
 * @param userId - User ID from Google OAuth sub claim
 * @param secret - JWT secret from environment
 * @param expiresIn - Token expiration time (default: 15 minutes)
 * @returns JWT access token string
 */
export async function generateAccessToken(
  userId: string,
  secret: string,
  expiresIn: string = "15m"
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  const token = await new SignJWT({ userId, type: "access" } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setSubject(userId)
    .sign(secretKey);

  return token;
}

/**
 * Generate JWT refresh token
 * @param userId - User ID from Google OAuth sub claim
 * @param secret - JWT refresh secret from environment
 * @param expiresIn - Token expiration time (default: 7 days)
 * @returns JWT refresh token string
 */
export async function generateRefreshToken(
  userId: string,
  secret: string,
  expiresIn: string = "7d"
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  const token = await new SignJWT({ userId, type: "refresh" } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setSubject(userId)
    .sign(secretKey);

  return token;
}

/**
 * Verify JWT token and extract payload
 * @param token - JWT token string
 * @param secret - JWT secret from environment
 * @returns Token payload with userId if valid, null if invalid
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<{ userId: string; type: "access" | "refresh" } | null> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify<TokenPayload>(token, secretKey);

    // Verify token type is present
    if (!payload.userId || !payload.type) {
      return null;
    }

    // Verify token type is valid
    if (payload.type !== "access" && payload.type !== "refresh") {
      return null;
    }

    return {
      userId: payload.userId,
      type: payload.type,
    };
  } catch (error) {
    // Token is invalid, expired, or malformed
    return null;
  }
}

/**
 * Extract userId from JWT token without full verification
 * Useful for logging or non-critical operations
 * @param token - JWT token string
 * @returns userId if token is parseable, null otherwise
 */
export function extractUserIdFromToken(token: string): string | null {
  try {
    // Decode without verification (just for extracting userId)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0))
      )
    );

    return payload.userId || null;
  } catch {
    return null;
  }
}
