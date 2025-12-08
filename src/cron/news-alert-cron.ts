import { API_KEY, API_URL } from "../util";
import type { Env } from "../index";
import { sendFCMNotification } from "../notifications/fcm-sender";
import { Logger } from "../logging/logger";

interface NewsArticle {
    title: string;
    publishedDate: string;
    symbol: string;
    url: string;
}

export async function runNewsAlertCron(env: Env, ctx?: ExecutionContext): Promise<void> {
    const traceId = `cron-news-${Date.now()}`;
    const logger = new Logger({
        traceId,
        userId: null,
        path: "/cron/news-alerts",
        service: "stockly-api",
    });

    try {
        if (!env.alertsKv) {
            logger.warn("Alerts KV is not configured; skipping news alert cron");
            return;
        }

        logger.info("Starting news alert cron job");

        // 1. Fetch all unique symbols from user preferences
        // We need to scan user_settings table
        // Note: This might be expensive if there are many users.
        // For now, we fetch all and process in memory.
        const settings = await env.stockly
            .prepare(`SELECT user_id, news_favorite_symbols FROM user_settings WHERE news_favorite_symbols IS NOT NULL`)
            .all<{ user_id: string; news_favorite_symbols: string }>();

        const userSymbolsMap = new Map<string, string[]>(); // symbol -> userIds[]
        const uniqueSymbols = new Set<string>();

        for (const row of settings.results || []) {
            try {
                const symbols: string[] = JSON.parse(row.news_favorite_symbols);
                if (Array.isArray(symbols)) {
                    for (const symbol of symbols) {
                        const normalized = symbol.trim().toUpperCase();
                        if (normalized) {
                            uniqueSymbols.add(normalized);
                            if (!userSymbolsMap.has(normalized)) {
                                userSymbolsMap.set(normalized, []);
                            }
                            userSymbolsMap.get(normalized)?.push(row.user_id);
                        }
                    }
                }
            } catch (e) {
                logger.warn("Failed to parse news_favorite_symbols", { userId: row.user_id });
            }
        }

        if (uniqueSymbols.size === 0) {
            logger.info("No favorite symbols found to check for news");
            return;
        }

        logger.info(`Checking news for ${uniqueSymbols.size} symbols`);

        // 2. Fetch news for each symbol
        // We process in batches to avoid rate limits if necessary, but FMP handles comma-separated symbols.
        // However, fetching news for ALL symbols in one go might be too much if the list is huge.
        // FMP batch limit is not strictly documented but usually robust.
        // Let's do it per symbol or small batches.
        // Given the requirement "Call FMP for each unique symbol", we'll loop.

        for (const symbol of uniqueSymbols) {
            try {
                const newsApi = `${API_URL}/news/stock?symbols=${symbol}&limit=5&apikey=${API_KEY}`;
                const res = await fetch(newsApi);
                if (!res.ok) {
                    logger.warn(`Failed to fetch news for ${symbol}`, { status: res.status });
                    continue;
                }

                const newsItems: any[] = await res.json();
                if (!Array.isArray(newsItems)) continue;

                // 3. Deduplication and Notification
                for (const item of newsItems) {
                    const article: NewsArticle = {
                        title: item.title,
                        publishedDate: item.publishedDate,
                        symbol: item.symbol,
                        url: item.url,
                    };

                    // Create a unique key for deduplication
                    // Key: news:{symbol}:{article_checksum}
                    // Checksum can be a hash of title + date
                    const checksum = await crypto.subtle.digest(
                        "SHA-256",
                        new TextEncoder().encode(`${article.title}${article.publishedDate}${article.symbol}`)
                    ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

                    const kvKey = `news:${symbol}:${checksum}`;
                    const exists = await env.alertsKv.get(kvKey);

                    if (!exists) {
                        // New article!
                        logger.info("New article found", { symbol, title: article.title });

                        // Mark as seen (TTL 7 days to avoid infinite growth, though news is time sensitive)
                        await env.alertsKv.put(kvKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });

                        // Notify users
                        const userIds = userSymbolsMap.get(symbol) || [];
                        if (userIds.length > 0) {
                            // Fetch push tokens for these users
                            // This is inefficient (N+1), better to fetch all tokens once or batch.
                            // For MVP, we fetch per user.

                            // Optimization: Fetch all tokens for these users in one query
                            const placeholders = userIds.map(() => "?").join(",");
                            const tokens = await env.stockly
                                .prepare(`SELECT user_id, token FROM user_push_tokens WHERE user_id IN (${placeholders})`)
                                .bind(...userIds)
                                .all<{ user_id: string; token: string }>();

                            for (const tokenRow of tokens.results || []) {
                                await sendFCMNotification(
                                    tokenRow.token,
                                    `${symbol} News`,
                                    article.title,
                                    {
                                        type: "news",
                                        symbol: symbol,
                                        url: article.url,
                                    },
                                    env,
                                    logger
                                );
                            }

                            logger.info(`Sent notifications to ${tokens.results?.length || 0} users for ${symbol}`);
                        }
                    }
                }

            } catch (error) {
                logger.error(`Error processing news for ${symbol}`, error);
            }
        }

        logger.info("News alert cron job completed");

    } catch (error) {
        logger.error("Fatal error in news alert cron job", error);
    }
}
