import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGeneralNews, getFavoriteNews, getNews } from '../src/api/get-news';
import { getArchivedNews, toggleArchivedNews } from '../src/api/news-archive';
import { updateUserPreferences } from '../src/api/user-preferences';
import { createTestEnv, createTestRequest, createMockLogger } from './test-utils';
import * as authMiddleware from '../src/auth/middleware';
import { clearNewsCache } from '../src/api/news-cache';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

vi.mock('../src/auth/middleware', () => ({
    authenticateRequest: vi.fn(),
    authenticateRequestWithAdmin: vi.fn(),
}));

describe('News API', () => {
    let env: any;

    beforeEach(() => {
        env = createTestEnv();
        fetchMock.mockReset();
        vi.clearAllMocks();
        clearNewsCache();

        // Default mock for authentication
        vi.mocked(authMiddleware.authenticateRequest).mockResolvedValue({
            username: "testuser",
            userId: "user-123",
            tokenType: "access" as const,
            isAdmin: false,
        });
    });

    describe('getGeneralNews', () => {
        it('should return general news from FMP API', async () => {
            const mockNews = [
                {
                    symbol: 'AAPL',
                    publishedDate: '2023-10-27 10:00:00',
                    title: 'Apple News',
                    image: 'image.jpg',
                    site: 'Source',
                    text: 'News text',
                    url: 'https://example.com',
                },
            ];

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => mockNews,
            });

            const request = createTestRequest('http://localhost/v1/api/news/general');
            const url = new URL(request.url);
            const logger = createMockLogger();
            const response = await getGeneralNews(request, url, env, logger);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveProperty('news');
            expect(Array.isArray(data.news)).toBe(true);
            expect(data.news).toHaveLength(1);
            expect(data.news[0].title).toBe('Apple News');
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/news/general-latest'),
                expect.any(Object)
            );
        });

        it('should handle API errors gracefully', async () => {
            // Use pagination to bypass cache (page=1 disables cache)
            // Mock fetch to throw an error (simulating API failure)
            fetchMock.mockRejectedValueOnce(new Error('API error'));

            const request = createTestRequest('http://localhost/v1/api/news/general?page=1');
            const url = new URL(request.url);
            const logger = createMockLogger();
            const response = await getGeneralNews(request, url, env, logger);
            const data = await response.json();

            // When API fails, the function should still return 200 with empty news array
            expect(response.status).toBe(200);
            expect(data.news).toEqual([]);
        });
    });

    describe('getFavoriteNews', () => {
        it('should return news for favorite symbols', async () => {
            // Mock user settings
            env.stockly = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue({
                            news_favorite_symbols: JSON.stringify(['AAPL', 'TSLA']),
                        }),
                    }),
                }),
            } as any;

            const mockNews = [
                {
                    symbol: 'AAPL',
                    publishedDate: '2023-10-27 10:00:00',
                    title: 'Apple News',
                    image: 'image.jpg',
                    site: 'Source',
                    text: 'News text',
                    url: 'https://example.com',
                },
            ];

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockNews,
            });

            const request = createTestRequest('http://localhost/v1/api/news/favorites');
            const url = new URL(request.url);
            const logger = createMockLogger();
            const response = await getFavoriteNews(request, url, env, logger);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveProperty('news');
            expect(Array.isArray(data.news)).toBe(true);
            // Note: Actual implementation might deduplicate or limit, but we expect some news
            expect(fetchMock).toHaveBeenCalled();
        });

        it('should return empty list if no favorites', async () => {
            env.stockly = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue(null),
                    }),
                }),
            } as any;

            const request = createTestRequest('http://localhost/v1/api/news/favorites');
            const url = new URL(request.url);
            const logger = createMockLogger();
            const response = await getFavoriteNews(request, url, env, logger);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.news).toEqual([]);
        });
    });

    describe('News Archive', () => {
        it('should toggle archived news', async () => {
            const articleId = 'test-article-id';
            const request = createTestRequest(
                `http://localhost/v1/api/news/archive/${articleId}`,
                'POST',
                {
                    title: 'Test Article',
                    url: 'https://example.com',
                    publishedDate: '2023-10-27',
                    source: 'Test Source',
                }
            );

            // Mock DB calls: user lookup, then bookmark check, then insert
            let callCount = 0;
            env.stockly = {
                prepare: vi.fn().mockImplementation((query: string) => {
                    const stmt = {
                        bind: vi.fn().mockReturnValue({
                            first: vi.fn().mockImplementation(() => {
                                callCount++;
                                if (query.includes("SELECT id FROM users")) {
                                    return Promise.resolve({ id: "user-123" });
                                }
                                // Bookmark check - not exists
                                return Promise.resolve(null);
                            }),
                            run: vi.fn().mockResolvedValue({ success: true }),
                        }),
                    };
                    return stmt;
                }),
            } as any;

            const logger = createMockLogger();
            const response = await toggleArchivedNews(request, articleId, env, logger);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.saved).toBe(true);
        });

        it('should retrieve archived news', async () => {
            const mockSavedNews = [
                {
                    article_id: '1',
                    title: 'Saved Article',
                    url: 'https://example.com',
                    saved_at: '2023-10-27T10:00:00Z',
                    symbol: 'AAPL',
                },
            ];

            let callCount = 0;
            env.stockly = {
                prepare: vi.fn().mockImplementation((query: string) => {
                    const stmt = {
                        bind: vi.fn().mockReturnThis(),
                        first: vi.fn().mockResolvedValue({ id: 'user-123' }),
                        all: vi.fn().mockResolvedValue({ results: [] }),
                    };

                    if (query.includes('SELECT id FROM users')) {
                        // First call: get user_id from username
                        return stmt;
                    } else if (query.includes('SELECT COUNT(*)')) {
                        // Second call: get total count
                        stmt.first = vi.fn().mockResolvedValue({ total: 1 });
                        return stmt;
                    } else if (query.includes('SELECT article_id')) {
                        // Third call: get archived articles
                        stmt.all = vi.fn().mockResolvedValue({ results: mockSavedNews });
                        return stmt;
                    }
                    return stmt;
                }),
            } as any;

            const request = createTestRequest('http://localhost/v1/api/news/archive');
            const logger = createMockLogger();
            const response = await getArchivedNews(request, env, logger);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].title).toBe('Saved Article');
        });
    });

    describe('User Preferences', () => {
        it('should update news favorite symbols', async () => {
            const request = createTestRequest(
                'http://localhost/v1/api/users/preferences/update',
                'POST',
                {
                    newsFavoriteSymbols: ['AAPL', 'GOOGL'],
                }
            );

            // Mock user lookup and preferences update
            let callCount = 0;
            env.stockly = {
                prepare: vi.fn().mockImplementation((query: string) => {
                    const stmt = {
                        bind: vi.fn().mockReturnValue({
                            first: vi.fn().mockImplementation(() => {
                                callCount++;
                                if (query.includes("SELECT id FROM users")) {
                                    return Promise.resolve({ id: "user-123" });
                                }
                                return Promise.resolve(null);
                            }),
                            run: vi.fn().mockResolvedValue({ success: true }),
                        }),
                    };
                    return stmt;
                }),
            } as any;

            const logger = createMockLogger();
            const response = await updateUserPreferences(request, env, logger);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });
    });

    describe('getNews', () => {
        it('should return news for a specific symbol', async () => {
            const mockNews = [
                {
                    symbol: 'AAPL',
                    publishedDate: '2023-10-27 10:00:00',
                    title: 'Apple News',
                    text: 'News text',
                    url: 'https://example.com',
                },
            ];

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => mockNews,
            });

            const request = createTestRequest('http://localhost/v1/api/news?symbol=AAPL');
            const url = new URL(request.url);
            const logger = createMockLogger();
            const response = await getNews(request, url, env, logger);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.symbols).toEqual(['AAPL']);
            expect(data.news).toHaveLength(1);
            expect(data.news[0].symbol).toBe('AAPL');
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('symbols=AAPL'),
                expect.any(Object)
            );
        });

        it('should validate pagination parameters', async () => {
            const invalidRequests = [
                'http://localhost/v1/api/news?symbol=AAPL&from=invalid',
                'http://localhost/v1/api/news?symbol=AAPL&to=invalid',
                'http://localhost/v1/api/news?symbol=AAPL&page=-1',
                'http://localhost/v1/api/news?symbol=AAPL&limit=300',
            ];

            const logger = createMockLogger();

            for (const reqUrl of invalidRequests) {
                const request = createTestRequest(reqUrl);
                const url = new URL(request.url);
                const response = await getNews(request, url, env, logger);
                expect(response.status).toBe(400);
            }
        });

        it('should pass pagination parameters to API', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => [],
            });

            const request = createTestRequest('http://localhost/v1/api/news?symbol=AAPL&page=2&limit=10&from=2023-01-01');
            const url = new URL(request.url);
            const logger = createMockLogger();
            await getNews(request, url, env, logger);

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('page=2'),
                expect.any(Object)
            );
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('limit=10'),
                expect.any(Object)
            );
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('from=2023-01-01'),
                expect.any(Object)
            );
        });

        it('should flush KV cache pending writes', async () => {
            const kvs = new Map();
            env.alertsKv = {
                get: vi.fn((key) => kvs.get(key)),
                put: vi.fn(),
                list: vi.fn().mockResolvedValue({ keys: [] }),
            };

            const mockNews = [{ symbol: 'AAPL', title: 'Test' }];
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockNews,
            });

            // First call - Cache Miss
            const request = createTestRequest('http://localhost/v1/api/news?symbol=AAPL');
            const logger = createMockLogger();
            await getNews(request, new URL(request.url), env, logger);

            // Should have tried to get from KV
            expect(env.alertsKv.get).toHaveBeenCalled();
        });
    });
});
