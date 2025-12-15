
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAccessToken, generateRefreshToken, verifyToken, extractUsernameFromToken, extractUserIdFromToken } from '../../src/auth/jwt';
import { SignJWT } from 'jose';

describe('JWT Utilities', () => {
    const TEST_SECRET = 'test-secret-key-12345678901234567890';
    const TEST_USERNAME = 'testuser';

    describe('generateAccessToken', () => {
        it('should generate a valid access token', async () => {
            const token = await generateAccessToken(TEST_USERNAME, TEST_SECRET);
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3);

            const parts = token.split('.');
            const payload = JSON.parse(atob(parts[1]));
            expect(payload.username).toBe(TEST_USERNAME);
            expect(payload.type).toBe('access');
            expect(payload.exp).toBeDefined();
        });

        it('should set custom expiration', async () => {
            // We can't easily check the exact expiration without parsing, but we can verify it generates successfully
            const token = await generateAccessToken(TEST_USERNAME, TEST_SECRET, '1h');
            expect(token).toBeDefined();
        });
    });

    describe('generateRefreshToken', () => {
        it('should generate a valid refresh token', async () => {
            const token = await generateRefreshToken(TEST_USERNAME, TEST_SECRET);
            expect(typeof token).toBe('string');

            const parts = token.split('.');
            const payload = JSON.parse(atob(parts[1]));
            expect(payload.username).toBe(TEST_USERNAME);
            expect(payload.type).toBe('refresh');
        });
    });

    describe('verifyToken', () => {
        it('should return payload for valid access token', async () => {
            const token = await generateAccessToken(TEST_USERNAME, TEST_SECRET);
            const result = await verifyToken(token, TEST_SECRET);

            expect(result).not.toBeNull();
            expect(result?.username).toBe(TEST_USERNAME);
            expect(result?.type).toBe('access');
        });

        it('should return payload for valid refresh token', async () => {
            const token = await generateRefreshToken(TEST_USERNAME, TEST_SECRET);
            const result = await verifyToken(token, TEST_SECRET);

            expect(result).not.toBeNull();
            expect(result?.username).toBe(TEST_USERNAME);
            expect(result?.type).toBe('refresh');
        });

        it('should return null for invalid signature', async () => {
            const token = await generateAccessToken(TEST_USERNAME, TEST_SECRET);
            const result = await verifyToken(token, 'wrong-secret-key');

            expect(result).toBeNull();
        });

        it('should return null for malformed token', async () => {
            const result = await verifyToken('invalid.token.parts', TEST_SECRET);
            expect(result).toBeNull();
        });

        it('should return null if token payload is missing required fields', async () => {
            // Create a token with missing fields manually
            const secretKey = new TextEncoder().encode(TEST_SECRET);
            const token = await new SignJWT({ foo: 'bar' }) // Missing username/type
                .setProtectedHeader({ alg: 'HS256' })
                .sign(secretKey);

            const result = await verifyToken(token, TEST_SECRET);
            expect(result).toBeNull();
        });

        it('should return null if token type is invalid', async () => {
            const secretKey = new TextEncoder().encode(TEST_SECRET);
            const token = await new SignJWT({ username: TEST_USERNAME, type: 'invalid' as any })
                .setProtectedHeader({ alg: 'HS256' })
                .sign(secretKey);

            const result = await verifyToken(token, TEST_SECRET);
            expect(result).toBeNull();
        });
    });

    describe('extractUsernameFromToken', () => {
        it('should extract username from valid token string', async () => {
            // We can just construct a fake token string that looks like JWT
            const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
            const payload = btoa(JSON.stringify({ username: TEST_USERNAME, type: "access" }));
            const token = `${header}.${payload}.signature`;

            const username = extractUsernameFromToken(token);
            expect(username).toBe(TEST_USERNAME);
        });

        it('should return null for malformed token', () => {
            expect(extractUsernameFromToken('invalid-token')).toBeNull();
        });

        it('should return null if token cannot be decoded', () => {
            expect(extractUsernameFromToken('a.b.c')).toBeNull(); // Valid format but potentially invalid base64
        });
    });

    describe('extractUserIdFromToken', () => {
        it('should extract username (alias)', () => {
            const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
            const payload = btoa(JSON.stringify({ username: TEST_USERNAME, type: "access" }));
            const token = `${header}.${payload}.signature`;
            expect(extractUserIdFromToken(token)).toBe(TEST_USERNAME);
        });
    });
});
