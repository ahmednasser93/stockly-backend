
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticateRequest, authenticateRequestWithAdmin, isAdmin, setHttpOnlyCookie, clearHttpOnlyCookie } from '../../src/auth/middleware';
import { generateAccessToken, generateRefreshToken } from '../../src/auth/jwt';

describe('Auth Middleware', () => {
    const TEST_SECRET = 'test-secret-key-12345678901234567890';
    const REFRESH_SECRET = 'refresh-secret-key-12345678901234567890';
    const TEST_USERNAME = 'testuser';
    const ADMIN_USERNAME = 'sngvahmed';

    describe('authenticateRequest', () => {
        it('should authenticate with valid Authorization header', async () => {
            const token = await generateAccessToken(TEST_USERNAME, TEST_SECRET);
            const request = new Request('http://localhost', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const result = await authenticateRequest(request, TEST_SECRET);
            expect(result).not.toBeNull();
            expect(result?.username).toBe(TEST_USERNAME);
            expect(result?.tokenType).toBe('access');
        });

        it('should authenticate with valid access token cookie', async () => {
            const token = await generateAccessToken(TEST_USERNAME, TEST_SECRET);
            const request = new Request('http://localhost', {
                headers: {
                    'Cookie': `accessToken=${token}`
                }
            });

            const result = await authenticateRequest(request, TEST_SECRET);
            expect(result).not.toBeNull();
            expect(result?.username).toBe(TEST_USERNAME);
            expect(result?.tokenType).toBe('access');
        });

        it('should fallback to refresh token in header if access token fails and refresh secret provided', async () => {
            const token = await generateRefreshToken(TEST_USERNAME, REFRESH_SECRET);
            const request = new Request('http://localhost', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const result = await authenticateRequest(request, TEST_SECRET, REFRESH_SECRET);
            expect(result).not.toBeNull();
            expect(result?.username).toBe(TEST_USERNAME);
            expect(result?.tokenType).toBe('refresh');
        });

        it('should fallback to refresh token cookie if access token cookie missing', async () => {
            const token = await generateRefreshToken(TEST_USERNAME, REFRESH_SECRET);
            const request = new Request('http://localhost', {
                headers: {
                    'Cookie': `refreshToken=${token}`
                }
            });

            const result = await authenticateRequest(request, TEST_SECRET, REFRESH_SECRET);
            expect(result).not.toBeNull();
            expect(result?.username).toBe(TEST_USERNAME);
            expect(result?.tokenType).toBe('refresh');
        });

        it('should return null if no tokens provided', async () => {
            const request = new Request('http://localhost');
            const result = await authenticateRequest(request, TEST_SECRET);
            expect(result).toBeNull();
        });

        it('should return null for invalid token', async () => {
            const request = new Request('http://localhost', {
                headers: {
                    'Authorization': `Bearer invalid-token`
                }
            });
            const result = await authenticateRequest(request, TEST_SECRET);
            expect(result).toBeNull();
        });
    });

    describe('isAdmin', () => {
        it('should return true for admin username', () => {
            expect(isAdmin(ADMIN_USERNAME)).toBe(true);
        });

        it('should return false for other usernames', () => {
            expect(isAdmin('otheruser')).toBe(false);
        });
    });

    describe('authenticateRequestWithAdmin', () => {
        it('should return admin status true for admin user', async () => {
            const token = await generateAccessToken(ADMIN_USERNAME, TEST_SECRET);
            const request = new Request('http://localhost', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const envMock = { stockly: {} as any }; // D1Database mock not needed for this check as it just checks auth + username check

            const result = await authenticateRequestWithAdmin(request, envMock, TEST_SECRET);
            expect(result).not.toBeNull();
            expect(result?.username).toBe(ADMIN_USERNAME);
            expect(result?.isAdmin).toBe(true);
        });

        it('should return admin status false for normal user', async () => {
            const token = await generateAccessToken(TEST_USERNAME, TEST_SECRET);
            const request = new Request('http://localhost', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const envMock = { stockly: {} as any };

            const result = await authenticateRequestWithAdmin(request, envMock, TEST_SECRET);
            expect(result).not.toBeNull();
            expect(result?.username).toBe(TEST_USERNAME);
            expect(result?.isAdmin).toBe(false);
        });
    });

    describe('Cookie Helpers', () => {
        it('setHttpOnlyCookie should add Set-Cookie header', () => {
            const response = new Response('ok');
            const result = setHttpOnlyCookie(response, 'testCookie', 'testValue');

            const cookieHeader = result.headers.get('Set-Cookie');
            expect(cookieHeader).toContain('testCookie=testValue');
            expect(cookieHeader).toContain('HttpOnly');
            expect(cookieHeader).toContain('Secure');
        });

        it('clearHttpOnlyCookie should set immediate expiration', () => {
            const response = new Response('ok');
            const result = clearHttpOnlyCookie(response, 'testCookie');

            const cookieHeader = result.headers.get('Set-Cookie');
            expect(cookieHeader).toContain('testCookie=');
            expect(cookieHeader).toContain('Max-Age=0');
        });
    });
});
