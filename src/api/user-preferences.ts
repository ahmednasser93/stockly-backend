import { json } from "../util";
import type { Env } from "../index";
import type { Logger } from "../logging/logger";

export async function updateUserPreferences(
    request: Request,
    env: Env,
    logger: Logger
): Promise<Response> {
    try {
        const payload = await request.json() as any;
        const { userId, newsFavoriteSymbols } = payload;

        if (!userId || typeof userId !== "string") {
            return json({ error: "userId is required and must be a string" }, 400);
        }

        if (!Array.isArray(newsFavoriteSymbols)) {
            return json({ error: "newsFavoriteSymbols must be an array of strings" }, 400);
        }

        const symbolsJson = JSON.stringify(newsFavoriteSymbols);
        const now = new Date().toISOString();

        // Check if settings already exist for user
        const existing = await env.stockly
            .prepare(`SELECT user_id FROM user_settings WHERE user_id = ?`)
            .bind(userId)
            .first();

        if (existing) {
            // Update existing settings
            await env.stockly
                .prepare(
                    `UPDATE user_settings
           SET news_favorite_symbols = ?, updated_at = ?
           WHERE user_id = ?`
                )
                .bind(symbolsJson, now, userId)
                .run();
        } else {
            // Insert new settings (default refresh interval 5)
            await env.stockly
                .prepare(
                    `INSERT INTO user_settings (user_id, refresh_interval_minutes, news_favorite_symbols, updated_at)
           VALUES (?, 5, ?, ?)`
                )
                .bind(userId, symbolsJson, now)
                .run();
        }

        return json({ success: true, message: "Preferences updated" });
    } catch (error) {
        logger.error("Failed to update user preferences", error);
        return json({ error: "Failed to update user preferences" }, 500);
    }
}
