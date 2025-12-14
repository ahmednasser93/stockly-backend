import { json } from "../util";
import type { Env } from "../index";
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";

export async function updateUserPreferences(
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
    let userId: string | undefined;

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

        userId = user.id;

        const payload = await request.json() as any;
        const { newsFavoriteSymbols } = payload;
        // userId is from JWT authentication, not from payload

        if (!Array.isArray(newsFavoriteSymbols)) {
            return json({ error: "newsFavoriteSymbols must be an array of strings" }, 400, request);
        }

        const symbolsJson = JSON.stringify(newsFavoriteSymbols);
        const now = new Date().toISOString();

        // Check if settings already exist for user (by username)
        const existing = await env.stockly
            .prepare(`SELECT user_id FROM user_settings WHERE username = ?`)
            .bind(username)
            .first();

        if (existing) {
            // Update existing settings
            await env.stockly
                .prepare(
                    `UPDATE user_settings
           SET news_favorite_symbols = ?, updated_at = ?
           WHERE username = ?`
                )
                .bind(symbolsJson, now, username)
                .run();
        } else {
            // Insert new settings (default refresh interval 5) with both user_id and username
            await env.stockly
                .prepare(
                    `INSERT INTO user_settings (user_id, username, refresh_interval_minutes, news_favorite_symbols, updated_at)
           VALUES (?, ?, 5, ?, ?)`
                )
                .bind(userId, username, symbolsJson, now)
                .run();
        }

        return json({ success: true, message: "Preferences updated" }, 200, request);
    } catch (error) {
        logger.error("Failed to update user preferences", error, { username, userId });
        return json({ error: "Failed to update user preferences" }, 500, request);
    }
}
