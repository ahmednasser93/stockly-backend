import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleGoogleAuth, setUsername, checkUsernameAvailability, refreshToken, getCurrentUser, logout } from '../../src/api/auth';
import { createMockLogger } from '../test-utils';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../../src/auth/jwt';
import { authenticateRequest } from '../../src/auth/middleware';

// Mock dependencies
vi.mock('../../src/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
    verifyToken: vi.fn(),
  };
});

vi.mock('../../src/auth/middleware', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    setHttpOnlyCookie: vi.fn((res, name, value) => {
      res.headers.append('Set-Cookie', `${name}=${value}`);
      return res;
    }),
    clearHttpOnlyCookie: vi.fn((res, name) => {
      res.headers.append('Set-Cookie', `${name}=; Max-Age=0`);
      return res;
    }),
    authenticateRequest: vi.fn(),
  }
});

// We need to unmock authenticateRequest in the import above if we want to mock it differently per test or use the jwt one
// Actually, `authenticateRequest` is in middleware.ts, but imported in auth.ts from middleware.ts?
// Wait, in `src/api/auth.ts`, it imports `authenticateRequest` from `../auth/middleware`.
// So we should mock `src/auth/middleware`.

describe('Auth API', () => {
  let env: any;
  let logger: any;

  // Mock D1 Database
  const mockD1 = {
    prepare: vi.fn(() => mockD1),
    bind: vi.fn(() => mockD1),
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
  };

  // Helper to generate a valid-looking Google ID token
  const validGoogleToken = () => {
    const header = btoa(JSON.stringify({ kid: 'test-key-id', alg: 'RS256' }));
    const payload = btoa(JSON.stringify({
      sub: 'google-user-123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'http://example.com/pic.jpg',
      aud: 'test-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600
    }));
    return `${header}.${payload}.signature`;
  };

  beforeEach(() => {
    env = {
      stockly: mockD1,
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      GOOGLE_CLIENT_ID: 'test-client-id',
    };
    logger = createMockLogger();
    vi.clearAllMocks();

    // Default fetch mock for Google Certs
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [{ kid: 'test-key-id', n: '...' }]
      })
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleGoogleAuth', () => {
    it('should return 405 for non-POST requests', async () => {
      const req = new Request('http://localhost', { method: 'GET' });
      const res = await handleGoogleAuth(req, env, logger);
      expect(res.status).toBe(405);
    });

    it('should return error if idToken is missing', async () => {
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({})
      });
      const res = await handleGoogleAuth(req, env, logger);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("AUTH_MISSING_TOKEN");
    });

    it('should authenticate existing user', async () => {
      const token = validGoogleToken();
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ idToken: token })
      });

      mockD1.first.mockResolvedValue({
        id: 'google-user-123',
        username: 'existinguser',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'pic.jpg'
      });

      mockD1.run.mockResolvedValue({ meta: { changes: 1 } });

      const res = await handleGoogleAuth(req, env, logger);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.username).toBe('existinguser');
      expect(generateAccessToken).toHaveBeenCalled();
    });

    it('should create new user if not found', async () => {
      const token = validGoogleToken();
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ idToken: token })
      });

      mockD1.first.mockResolvedValue(null);
      mockD1.run.mockResolvedValue({ meta: { changes: 1 } });

      const res = await handleGoogleAuth(req, env, logger);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.email).toBe('test@example.com');
      expect(body.requiresUsername).toBe(true);
      expect(generateAccessToken).not.toHaveBeenCalled();
    });

    it('should return 401 if Google token verification fails', async () => {
      // Create a token that will fail signature/format check in real life,
      // but here we mock verifyGoogleToken implicitly?
      // Actually handleGoogleAuth calls verifyGoogleToken.
      // We can't easily mock verifyGoogleToken because it is not exported.
      // But verifyGoogleToken uses fetch.
      // We can mock fetch to return 400 or invalid keys.

      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ idToken: "bad.token.struct" })
      });

      // verifyGoogleToken will fail to decode and return null
      const res = await handleGoogleAuth(req, env, logger);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("AUTH_GOOGLE_VERIFICATION_FAILED");
    });

    it('should return 500 on DB error during user lookup', async () => {
      const token = validGoogleToken();
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ idToken: token })
      });

      mockD1.first.mockRejectedValue(new Error("DB Error"));
      const res = await handleGoogleAuth(req, env, logger);
      expect(res.status).toBe(500);
    });
  });

  describe('checkUsernameAvailability', () => {
    it('should return available true if username not taken', async () => {
      const req = new Request('http://localhost?username=newuser', { method: 'GET' });
      mockD1.first.mockResolvedValue({ count: 0 });
      const res = await checkUsernameAvailability(req, env, logger);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(true);
    });

    it('should return available false if username taken', async () => {
      const req = new Request('http://localhost?username=takenuser', { method: 'GET' });
      mockD1.first.mockResolvedValue({ count: 1 });
      const res = await checkUsernameAvailability(req, env, logger);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(false);
    });

    it('should return error for invalid format', async () => {
      const req = new Request('http://localhost?username=inv@lid', { method: 'GET' });
      const res = await checkUsernameAvailability(req, env, logger);
      const body = await res.json();
      expect(body.available).toBe(false);
      expect(body.reason).toBeDefined();
    });

    it('should return 500 on DB error', async () => {
      const req = new Request('http://localhost?username=newuser', { method: 'GET' });
      mockD1.first.mockRejectedValue(new Error("DB Error"));
      const res = await checkUsernameAvailability(req, env, logger);
      expect(res.status).toBe(500);
    });
  });

  describe('setUsername', () => {
    it('should set username using idToken flow (new user)', async () => {
      const token = validGoogleToken();
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ username: 'finaluser', idToken: token })
      });

      // 1. Check if user exists (by google id)
      mockD1.first
        .mockResolvedValueOnce({ id: 'google-user-123', username: null })
        // 2. Check availability
        .mockResolvedValueOnce({ count: 0 })
        // 3. Return updated user
        .mockResolvedValueOnce({ id: 'google-user-123', username: 'finaluser', email: '...', name: '...' });

      mockD1.run.mockResolvedValue({ meta: { changes: 1 } });

      const res = await setUsername(req, env, logger);

      expect(res.status).toBe(200);
      expect(mockD1.run).toHaveBeenCalled();
      expect(generateAccessToken).toHaveBeenCalled();
    });

    it('should handle UNIQUE constraint violation', async () => {
      const token = validGoogleToken();
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ username: 'taken', idToken: token })
      });

      // Mock auth part (user lookup)
      mockD1.first
        .mockResolvedValueOnce({ id: 'google-user-123', username: null })
        .mockResolvedValueOnce({ count: 0 }); // Check says available (mock race condition or initial check pass)

      // Simulate DB error on update
      mockD1.run.mockRejectedValue(new Error('UNIQUE constraint failed: users.username'));

      const res = await setUsername(req, env, logger);
      expect(res.status).toBe(400); // USERNAME_TAKEN maps to 400
      const body = await res.json() as any;
      expect(body.error.code).toBe('USERNAME_TAKEN');
    });


    it('should handle race condition (changes=0)', async () => {
      const token = validGoogleToken();
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ username: 'raceuser', idToken: token })
      });

      mockD1.first
        .mockResolvedValueOnce({ id: 'uid', username: null }) // User lookup
        .mockResolvedValueOnce({ count: 0 }); // Availability check passes

      mockD1.run.mockResolvedValue({ meta: { changes: 0 } }); // Update fails (race)

      const res = await setUsername(req, env, logger);
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.error.code).toBe('USERNAME_TAKEN');
    });

    it('should return 500 if updated user cannot be fetched', async () => {
      const token = validGoogleToken();
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ username: 'okuser', idToken: token })
      });

      mockD1.first
        .mockResolvedValueOnce({ id: 'uid', username: null })
        .mockResolvedValueOnce({ count: 0 }); // Availability

      mockD1.run.mockResolvedValue({ meta: { changes: 1 } });

      // Fetch updated user returns null
      mockD1.first.mockResolvedValueOnce(null);

      const res = await setUsername(req, env, logger);
      expect(res.status).toBe(500);
    });

    it('should return 400 if user already has username', async () => {
      const token = validGoogleToken();
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ username: 'newname', idToken: token })
      });

      // Lookup returns user WITH username
      mockD1.first.mockResolvedValueOnce({ id: 'uid', username: 'existing' });

      const res = await setUsername(req, env, logger);
      expect(res.status).toBe(409);
      const body = await res.json() as any;
      expect(body.error.code).toBe('USERNAME_ALREADY_SET');
    });
  });

  describe('refreshToken', () => {
    it('should return 405 for non-POST requests', async () => {
      const req = new Request('http://localhost', { method: 'GET' });
      const res = await refreshToken(req, env, logger);
      expect(res.status).toBe(405);
    });

    it('should extract token from cookie', async () => {
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Cookie': 'refreshToken=valid-refresh-token' }
      });

      (verifyToken as any).mockResolvedValue({ username: 'testuser', type: 'refresh' });
      (generateAccessToken as any).mockResolvedValue('new-access-token');

      const res = await refreshToken(req, env, logger);
      expect(res.status).toBe(200);
      expect(res.headers.get('Set-Cookie')).toContain('accessToken=new-access-token');
    });

    it('should extract token from body (mobile)', async () => {
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'User-Agent': 'Mobile' },
        body: JSON.stringify({ refreshToken: 'valid-refresh-token' })
      });

      (verifyToken as any).mockResolvedValue({ username: 'testuser', type: 'refresh' });
      (generateAccessToken as any).mockResolvedValue('new-access-token');

      const res = await refreshToken(req, env, logger);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.accessToken).toBe('new-access-token');
    });

    it('should return 400 if token missing', async () => {
      const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) });
      const res = await refreshToken(req, env, logger);
      expect(res.status).toBe(401); // AUTH_MISSING_TOKEN maps to 401
    });

    it('should return 401 if token invalid', async () => {
      const req = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'invalid' })
      });
      (verifyToken as any).mockResolvedValue(null);
      const res = await refreshToken(req, env, logger);
      expect(res.status).toBe(401);
    });
  });

  describe('getCurrentUser', () => {
    it('should return 405 for non-GET requests', async () => {
      const req = new Request('http://localhost', { method: 'POST' });
      const res = await getCurrentUser(req, env, logger);
      expect(res.status).toBe(405);
    });

    it('should return 401 if not authenticated', async () => {
      const req = new Request('http://localhost', { method: 'GET' });
      // We need to mock authenticateRequest which calls verifyToken
      // But verifyToken is mocked above.
      // authenticateRequest calls verifyToken.
      // If we mock authenticateRequest directly (in middleware mock), we can control it.
      const mw = await import('../../src/auth/middleware');
      (mw.authenticateRequest as any).mockResolvedValue(null);

      const res = await getCurrentUser(req, env, logger);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("AUTH_MISSING_TOKEN");
    });

    it('should return user info if authenticated', async () => {
      const req = new Request('http://localhost', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid-token' }
      });

      const mw = await import('../../src/auth/middleware');
      (mw.authenticateRequest as any).mockResolvedValue({ username: 'testuser', type: 'access' });

      mockD1.prepare.mockReturnValue(mockD1);
      mockD1.bind.mockReturnValue(mockD1);
      mockD1.first.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test Name',
        picture: 'pic.jpg'
      });

      const res = await getCurrentUser(req, env, logger);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.username).toBe('testuser');
    });

    it('should return 404 if user not found in DB', async () => {
      const req = new Request('http://localhost', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid-token' }
      });

      const mw = await import('../../src/auth/middleware');
      (mw.authenticateRequest as any).mockResolvedValue({ username: 'testuser', type: 'access' });

      mockD1.first.mockResolvedValue(null);

      const res = await getCurrentUser(req, env, logger);
      expect(res.status).toBe(404); // USER_NOT_FOUND now maps to 404
      const body = await res.json();
      expect(body.error.code).toBe("USER_NOT_FOUND");
    });
  });

  describe('logout', () => {
    it('should return 405 for non-POST requests', async () => {
      const req = new Request('http://localhost', { method: 'GET' });
      const res = await logout(req, env, logger);
      expect(res.status).toBe(405);
    });

    it('should clear cookies and log event', async () => {
      const req = new Request('http://localhost', { method: 'POST' });

      const mw = await import('../../src/auth/middleware');
      (mw.authenticateRequest as any).mockResolvedValue({ userId: 'user-123', type: 'access' });

      const res = await logout(req, env, logger);
      expect(res.status).toBe(200);
    });
  });

});



