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

        logger.info(`Checking news for ${uniqueSymbols.size} unique symbols: ${Array.from(uniqueSymbols).join(", ")}`);

        // 2. Fetch news for ALL unique symbols in ONE batch call
        // FMP API supports comma-separated symbols, so we can fetch all at once
        // This is more efficient than fetching per symbol
        const symbolsArray = Array.from(uniqueSymbols);
        const symbolsParam = symbolsArray.join(",");
        
        // Get today's date in YYYY-MM-DD format for filtering
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        
        logger.info(`Fetching news for all symbols published today (${todayStr})`);

        try {
            // Fetch news for all symbols at once, filtered by today's date
            const newsApi = `${API_URL}/news/stock?symbols=${symbolsParam}&from=${todayStr}&to=${todayStr}&apikey=${API_KEY}`;
            const res = await fetch(newsApi);
            if (!res.ok) {
                logger.warn(`Failed to fetch news for symbols`, { status: res.status, symbols: symbolsParam });
                return;
            }

            const newsItems: any[] = await res.json();
            if (!Array.isArray(newsItems)) {
                logger.warn("FMP API returned non-array response", { responseType: typeof newsItems });
                return;
            }

            logger.info(`Fetched ${newsItems.length} news articles published today`);

            // Group news by symbol for processing
            const newsBySymbol = new Map<string, any[]>();
            for (const item of newsItems) {
                const symbol = (item.symbol || "").trim().toUpperCase();
                if (symbol && uniqueSymbols.has(symbol)) {
                    if (!newsBySymbol.has(symbol)) {
                        newsBySymbol.set(symbol, []);
                    }
                    newsBySymbol.get(symbol)!.push(item);
                }
            }

            logger.info(`Found news for ${newsBySymbol.size} symbols: ${Array.from(newsBySymbol.keys()).join(", ")}`);

            // 3. Process news for each symbol and send notifications
            for (const [symbol, items] of newsBySymbol.entries()) {
                try {

                    // Process each news article for this symbol
                    for (const item of items) {
                        const article: NewsArticle = {
                            title: item.title || "",
                            publishedDate: item.publishedDate || "",
                            symbol: symbol,
                            url: item.url || "",
                        };

                        // Verify the article was published today
                        const publishedDate = new Date(article.publishedDate);
                        const isToday = publishedDate.toISOString().split("T")[0] === todayStr;
                        
                        if (!isToday) {
                            logger.debug(`Skipping article not published today: ${article.title} (${article.publishedDate})`);
                            continue;
                        }

                        // Create a unique key for deduplication
                        // Key: news:{symbol}:{article_checksum}
                        // Checksum is a hash of title + date + symbol
                        const checksum = await crypto.subtle.digest(
                            "SHA-256",
                            new TextEncoder().encode(`${article.title}${article.publishedDate}${article.symbol}`)
                        ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

                        const kvKey = `news:${symbol}:${checksum}`;
                        const exists = await env.alertsKv.get(kvKey);

                        if (!exists) {
                            // New article published today!
                            logger.info("New article found (published today)", { 
                                symbol, 
                                title: article.title,
                                publishedDate: article.publishedDate 
                            });

                            // Mark as seen (TTL 7 days to avoid infinite growth, though news is time sensitive)
                            await env.alertsKv.put(kvKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });

                            // Notify users who have this symbol in their favorites
                            const userIds = userSymbolsMap.get(symbol) || [];
                            if (userIds.length > 0) {
                                logger.info(`Found ${userIds.length} users with ${symbol} in favorites: ${userIds.join(", ")}`);

                                // Fetch all active push tokens for these users in one query (using new schema)
                                // This will get ALL active devices for each user (supporting multiple devices per user)
                                const placeholders = userIds.map(() => "?").join(",");
                                const tokens = await env.stockly
                                    .prepare(
                                      `SELECT d.user_id, dpt.push_token
                                       FROM device_push_tokens dpt
                                       INNER JOIN devices d ON dpt.device_id = d.id
                                       WHERE d.user_id IN (${placeholders}) AND dpt.is_active = 1 AND d.is_active = 1`
                                    )
                                    .bind(...userIds)
                                    .all<{ user_id: string; push_token: string }>();

                                let notificationCount = 0;
                                for (const tokenRow of tokens.results || []) {
                                    try {
                                        await sendFCMNotification(
                                            tokenRow.push_token,
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
                                        notificationCount++;
                                    } catch (notifError) {
                                        logger.error(`Failed to send notification to user ${tokenRow.user_id}`, notifError);
                                    }
                                }

                                logger.info(`Sent ${notificationCount} notifications for ${symbol} news to ${userIds.length} users`);
                            } else {
                                logger.debug(`No users found with ${symbol} in favorites`);
                            }
                        } else {
                            logger.debug(`Article already notified: ${article.title} (${symbol})`);
                        }
                    }
                } catch (error) {
                    logger.error(`Error processing news for ${symbol}`, error);
                }
            }
        } catch (error) {
            logger.error("Failed to fetch news from FMP API", error);
        }

        logger.info("News alert cron job completed");

    } catch (error) {
        logger.error("Fatal error in news alert cron job", error);
    }
}
