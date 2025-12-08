import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGeneralNews, getFavoriteNews } from '../src/api/get-news';
import { getArchivedNews, toggleArchivedNews } from '../src/api/news-archive';
import { updatePreferences } from '../src/api/user-preferences';
import { createTestEnv, createTestRequest } from './test-utils';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('News API', () => {
    let env: any;

    beforeEach(() => {
        env = createTestEnv();
        fetchMock.mockReset();
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
            const response = await getGeneralNews(request, env);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveProperty('news');
            expect(data.news).toHaveLength(1);
            expect(data.news[0].title).toBe('Apple News');
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/news/general-latest'),
                expect.any(Object)
            );
        });

        it('should handle API errors gracefully', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

            const request = createTestRequest('http://localhost/v1/api/news/general');
            const response = await getGeneralNews(request, env);
            const data = await response.json();

            expect(response.status).toBe(200); // Should return empty list, not error
            expect(data.news).toEqual([]);
        });
    });

    describe('getFavoriteNews', () => {
        it('should return news for favorite symbols', async () => {
            // Mock user settings
            env.DB.prepare = vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue({
                        news_favorite_symbols: JSON.stringify(['AAPL', 'TSLA']),
                    }),
                }),
            });

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
            const response = await getFavoriteNews(request, env);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveProperty('news');
            // Note: Actual implementation might deduplicate or limit, but we expect some news
            expect(fetchMock).toHaveBeenCalled();
        });

        it('should return empty list if no favorites', async () => {
            env.DB.prepare = vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null),
                }),
            });

            const request = createTestRequest('http://localhost/v1/api/news/favorites');
            const response = await getFavoriteNews(request, env);
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

            // Mock DB check (not exists)
            env.DB.prepare = vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null), // Not bookmarked yet
                    run: vi.fn().mockResolvedValue({ success: true }),
                }),
            });

            const response = await toggleArchivedNews(request, env);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.bookmarked).toBe(true);
        });

        it('should retrieve archived news', async () => {
            const mockSavedNews = [
                {
                    article_id: '1',
                    title: 'Saved Article',
                    url: 'https://example.com',
                    published_date: '2023-10-27',
                    source: 'Test Source',
                    symbol: 'AAPL',
                    image_url: 'image.jpg',
                },
            ];

            env.DB.prepare = vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    all: vi.fn().mockResolvedValue({ results: mockSavedNews }),
                }),
            });

            const request = createTestRequest('http://localhost/v1/api/news/archive');
            const response = await getArchivedNews(request, env);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.news).toHaveLength(1);
            expect(data.news[0].title).toBe('Saved Article');
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

            env.DB.prepare = vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    run: vi.fn().mockResolvedValue({ success: true }),
                }),
            });

            const response = await updatePreferences(request, env);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });
    });
});
