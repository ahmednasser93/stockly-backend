import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
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
    // Authenticate request to get userId
    const auth = await authenticateRequest(
        request,
        env.JWT_SECRET || "",
        env.JWT_REFRESH_SECRET
    );

    if (!auth) {
        const { response } = createErrorResponse(
            "AUTH_MISSING_TOKEN",
            "Authentication required",
            undefined,
            undefined,
            request
        );
        return response;
    }

    const username = auth.username;
    const url = new URL(request.url);

    // Parse pagination parameters
    const page = parsePage(url.searchParams.get("page"));
    const limit = parseLimit(url.searchParams.get("limit"));

    // Validate pagination parameters
    if (url.searchParams.has("page") && page === undefined) {
        logger.warn("getArchivedNews: invalid page parameter", { 
            username, 
            pageParam: url.searchParams.get("page") 
        });
        return json({ error: "invalid 'page' parameter (must be non-negative integer)" }, 400, request);
    }
    if (url.searchParams.has("limit") && limit === undefined) {
        logger.warn("getArchivedNews: invalid limit parameter", { 
            username, 
            limitParam: url.searchParams.get("limit") 
        });
        return json({ error: "invalid 'limit' parameter (must be 1-250)" }, 400, request);
    }

    const pageNum = page ?? 0;
    const limitNum = limit ?? 20;
    const offset = pageNum * limitNum;

    try {
        // Get user_id from username first
        const user = await env.stockly
            .prepare("SELECT id FROM users WHERE username = ?")
            .bind(username)
            .first<{ id: string }>();

        if (!user) {
            const { response } = createErrorResponse(
                "USER_NOT_FOUND",
                "User not found",
                undefined,
                undefined,
                request
            );
            return response;
        }

        const userId = user.id;

        logger.info("Fetching archived news", { username, userId, page: pageNum, limit: limitNum });

        // Get total count for pagination metadata (by username)
        const countResult = await env.stockly
            .prepare(`SELECT COUNT(*) as total FROM user_saved_news WHERE username = ?`)
            .bind(username)
            .first<{ total: number }>();

        const total = countResult?.total ?? 0;

        // Fetch paginated results (by username)
        const results = await env.stockly
            .prepare(
                `SELECT article_id, symbol, title, url, saved_at
         FROM user_saved_news
         WHERE username = ?
         ORDER BY saved_at DESC
         LIMIT ? OFFSET ?`
            )
            .bind(username, limitNum, offset)
            .all();

        const articles = results.results || [];
        const hasMore = offset + articles.length < total;

        logger.info("Archived news fetched successfully", { 
            username,
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
        logger.error("Failed to fetch archived news", error, { username, page: pageNum, limit: limitNum });
        return json({ error: "Failed to fetch archived news" }, 500, request);
    }
}

export async function toggleArchivedNews(
    request: Request,
    articleId: string,
    env: Env,
    logger: Logger
): Promise<Response> {
    // Authenticate request to get userId
    const auth = await authenticateRequest(
        request,
        env.JWT_SECRET || "",
        env.JWT_REFRESH_SECRET
    );

    if (!auth) {
        const { response } = createErrorResponse(
            "AUTH_MISSING_TOKEN",
            "Authentication required",
            undefined,
            undefined,
            request
        );
        return response;
    }

    const username = auth.username;

    try {
        // Get user_id from username first
        const user = await env.stockly
            .prepare("SELECT id FROM users WHERE username = ?")
            .bind(username)
            .first<{ id: string }>();

        if (!user) {
            const { response } = createErrorResponse(
                "USER_NOT_FOUND",
                "User not found",
                undefined,
                undefined,
                request
            );
            return response;
        }

        const userId = user.id;

        let payload: any = {};
        try {
            const requestBody = await request.text();
            if (requestBody) {
                payload = JSON.parse(requestBody);
            }
        } catch (error) {
            logger.warn("Failed to parse request body for toggle archived news", { 
                username, 
                articleId,
                error: error instanceof Error ? error.message : String(error)
            });
            // Continue with empty payload - we can still check if article exists
        }

        const { symbol, title, url } = payload;
        
        // Check if article already exists
        const existing = await env.stockly
            .prepare(
                `SELECT article_id FROM user_saved_news WHERE username = ? AND article_id = ?`
            )
            .bind(username, articleId)
            .first();

        if (existing) {
            // Remove - article is already saved, so unsave it
            await env.stockly
                .prepare(
                    `DELETE FROM user_saved_news WHERE username = ? AND article_id = ?`
                )
                .bind(username, articleId)
                .run();
            logger.info("Article unsaved successfully", { username, articleId });
            return json({ success: true, saved: false }, 200, request);
        } else {
            // Add - article is not saved, so save it
            // Validate required fields
            if (!title || typeof title !== 'string' || title.trim().length === 0) {
                logger.warn("Invalid title in toggle archived news request", { username, articleId, title });
                return json({ error: "title is required and must be a non-empty string" }, 400, request);
            }
            
            if (!url || typeof url !== 'string' || url.trim().length === 0) {
                logger.warn("Invalid url in toggle archived news request", { username, articleId, url });
                return json({ error: "url is required and must be a non-empty string" }, 400, request);
            }

            // Symbol is optional, but if provided should be a string
            const symbolValue = (symbol && typeof symbol === 'string') ? symbol.trim() : '';

            try {
                await env.stockly
                    .prepare(
                        `INSERT INTO user_saved_news (user_id, username, article_id, symbol, title, url)
                         VALUES (?, ?, ?, ?, ?, ?)`
                    )
                    .bind(userId, username, articleId, symbolValue, title.trim(), url.trim())
                    .run();
                logger.info("Article saved successfully", { username, articleId, symbol: symbolValue });
                return json({ success: true, saved: true }, 200, request);
            } catch (error) {
                // Check if it's a unique constraint violation (article already exists)
                if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
                    logger.warn("Article already exists (race condition)", { username, articleId });
                    return json({ success: true, saved: true }, 200, request);
                }
                throw error;
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to toggle archived news", error, { 
            username, 
            userId, 
            articleId,
            errorMessage 
        });
        
        // Provide more specific error message
        if (errorMessage.includes('UNIQUE constraint')) {
            return json({ 
                error: "Article already saved",
                success: true,
                saved: true 
            }, 200, request);
        }
        
        return json({ 
            error: `Failed to toggle archived news: ${errorMessage}` 
        }, 500, request);
    }
}
