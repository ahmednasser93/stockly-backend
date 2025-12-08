import { json } from "../util";
import type { Env } from "../index";
import type { Logger } from "../logging/logger";

/**
 * Parse page number from query parameter (0-based, default 0)
 */
function parsePage(pageStr: string | null): number | undefined {
    if (!pageStr) return undefined;
    const page = parseInt(pageStr, 10);
    if (isNaN(page) || page < 0) return undefined;
    return page;
}

/**
 * Parse limit from query parameter (1-250, default 20)
 */
function parseLimit(limitStr: string | null): number | undefined {
    if (!limitStr) return undefined;
    const limit = parseInt(limitStr, 10);
    if (isNaN(limit) || limit < 1 || limit > 250) return undefined;
    return limit;
}

export async function getArchivedNews(
    request: Request,
    env: Env,
    logger: Logger
): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
        logger.warn("getArchivedNews: userId is required", { url: url.toString() });
        return json({ error: "userId is required" }, 400);
    }

    // Parse pagination parameters
    const page = parsePage(url.searchParams.get("page"));
    const limit = parseLimit(url.searchParams.get("limit"));

    // Validate pagination parameters
    if (url.searchParams.has("page") && page === undefined) {
        logger.warn("getArchivedNews: invalid page parameter", { 
            userId, 
            pageParam: url.searchParams.get("page") 
        });
        return json({ error: "invalid 'page' parameter (must be non-negative integer)" }, 400);
    }
    if (url.searchParams.has("limit") && limit === undefined) {
        logger.warn("getArchivedNews: invalid limit parameter", { 
            userId, 
            limitParam: url.searchParams.get("limit") 
        });
        return json({ error: "invalid 'limit' parameter (must be 1-250)" }, 400);
    }

    const pageNum = page ?? 0;
    const limitNum = limit ?? 20;
    const offset = pageNum * limitNum;

    try {
        logger.info("Fetching archived news", { userId, page: pageNum, limit: limitNum });

        // Get total count for pagination metadata
        const countResult = await env.stockly
            .prepare(`SELECT COUNT(*) as total FROM user_saved_news WHERE user_id = ?`)
            .bind(userId)
            .first<{ total: number }>();

        const total = countResult?.total ?? 0;

        // Fetch paginated results
        const results = await env.stockly
            .prepare(
                `SELECT article_id, symbol, title, url, saved_at
         FROM user_saved_news
         WHERE user_id = ?
         ORDER BY saved_at DESC
         LIMIT ? OFFSET ?`
            )
            .bind(userId, limitNum, offset)
            .all();

        const articles = results.results || [];
        const hasMore = offset + articles.length < total;

        logger.info("Archived news fetched successfully", { 
            userId, 
            page: pageNum, 
            limit: limitNum, 
            total, 
            returned: articles.length,
            hasMore 
        });

        return json({
            userId,
            articles,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                hasMore,
            },
        });
    } catch (error) {
        logger.error("Failed to fetch archived news", error, { userId, page: pageNum, limit: limitNum });
        return json({ error: "Failed to fetch archived news" }, 500);
    }
}

export async function toggleArchivedNews(
    request: Request,
    articleId: string,
    env: Env,
    logger: Logger
): Promise<Response> {
    try {
        const payload = await request.json() as any;
        const { userId, symbol, title, url, action } = payload;

        if (!userId) {
            return json({ error: "userId is required" }, 400);
        }

        // action can be 'save' or 'unsave' (optional, if not provided, toggle logic could be used but explicit is better)
        // However, for toggle endpoint, usually we check existence.
        // The PRD says "Toggles the saved status".
        // But passing metadata (symbol, title, url) suggests we might need to insert.

        // Let's implement toggle logic: check if exists, if yes delete, if no insert.
        // But we need symbol, title, url for insert.

        const existing = await env.stockly
            .prepare(
                `SELECT article_id FROM user_saved_news WHERE user_id = ? AND article_id = ?`
            )
            .bind(userId, articleId)
            .first();

        if (existing) {
            // Remove
            await env.stockly
                .prepare(
                    `DELETE FROM user_saved_news WHERE user_id = ? AND article_id = ?`
                )
                .bind(userId, articleId)
                .run();
            return json({ success: true, saved: false });
        } else {
            // Add
            if (!symbol || !title || !url) {
                return json({ error: "symbol, title, and url are required to save article" }, 400);
            }

            await env.stockly
                .prepare(
                    `INSERT INTO user_saved_news (user_id, article_id, symbol, title, url)
           VALUES (?, ?, ?, ?, ?)`
                )
                .bind(userId, articleId, symbol, title, url)
                .run();
            return json({ success: true, saved: true });
        }
    } catch (error) {
        logger.error("Failed to toggle archived news", error);
        return json({ error: "Failed to toggle archived news" }, 500);
    }
}
