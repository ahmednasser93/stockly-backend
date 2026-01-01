/**
 * Repository for User Senator Follows
 * Handles database operations for user_senator_follows table
 */

import type { Env } from "../../index";
import type {
  UserSenatorFollow,
  UserSenatorFollowRow,
  SenatorFollowPreferences,
} from "../senate-trading/types";
import { mapRowToUserFollow } from "../senate-trading/models";

/**
 * Follow a senator for a user
 */
export async function followSenator(
  env: Env,
  userId: string,
  username: string,
  senatorName: string,
  preferences: SenatorFollowPreferences
): Promise<void> {
  try {
    const now = new Date().toISOString();

    await env.stockly
      .prepare(
        `INSERT INTO user_senator_follows 
         (user_id, username, senator_name, alert_on_purchase, alert_on_sale, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, senator_name) DO UPDATE SET
           alert_on_purchase = excluded.alert_on_purchase,
           alert_on_sale = excluded.alert_on_sale,
           updated_at = excluded.updated_at`
      )
      .bind(
        userId,
        username,
        senatorName,
        preferences.alertOnPurchase ? 1 : 0,
        preferences.alertOnSale ? 1 : 0,
        now,
        now
      )
      .run();
  } catch (error) {
    console.error("[followSenator] Error following senator:", error);
    throw error;
  }
}

/**
 * Unfollow a senator for a user
 */
export async function unfollowSenator(
  env: Env,
  userId: string,
  senatorName: string
): Promise<void> {
  try {
    await env.stockly
      .prepare(`DELETE FROM user_senator_follows WHERE user_id = ? AND senator_name = ?`)
      .bind(userId, senatorName)
      .run();
  } catch (error) {
    console.error("[unfollowSenator] Error unfollowing senator:", error);
    throw error;
  }
}

/**
 * Get all senators a user follows
 */
export async function getUserFollows(
  env: Env,
  userId: string
): Promise<UserSenatorFollow[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT user_id, username, senator_name, alert_on_purchase, alert_on_sale, 
                created_at, updated_at
         FROM user_senator_follows
         WHERE user_id = ?
         ORDER BY senator_name`
      )
      .bind(userId)
      .all<UserSenatorFollowRow>();

    return (result.results ?? []).map(mapRowToUserFollow);
  } catch (error) {
    console.error("[getUserFollows] Error fetching user follows:", error);
    throw error;
  }
}

/**
 * Get all users who follow a specific senator
 */
export async function getFollowersOfSenator(
  env: Env,
  senatorName: string
): Promise<UserSenatorFollow[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT user_id, username, senator_name, alert_on_purchase, alert_on_sale, 
                created_at, updated_at
         FROM user_senator_follows
         WHERE senator_name = ?`
      )
      .bind(senatorName)
      .all<UserSenatorFollowRow>();

    return (result.results ?? []).map(mapRowToUserFollow);
  } catch (error) {
    console.error("[getFollowersOfSenator] Error fetching followers:", error);
    throw error;
  }
}

/**
 * Update follow preferences for a user-senator relationship
 */
export async function updateFollowPreferences(
  env: Env,
  userId: string,
  senatorName: string,
  preferences: Partial<SenatorFollowPreferences>
): Promise<void> {
  try {
    const updates: string[] = [];
    const bindings: any[] = [];

    if (preferences.alertOnPurchase !== undefined) {
      updates.push("alert_on_purchase = ?");
      bindings.push(preferences.alertOnPurchase ? 1 : 0);
    }

    if (preferences.alertOnSale !== undefined) {
      updates.push("alert_on_sale = ?");
      bindings.push(preferences.alertOnSale ? 1 : 0);
    }

    if (updates.length === 0) {
      return; // No updates to make
    }

    updates.push("updated_at = ?");
    bindings.push(new Date().toISOString());
    bindings.push(userId, senatorName);

    const query = `UPDATE user_senator_follows 
                   SET ${updates.join(", ")} 
                   WHERE user_id = ? AND senator_name = ?`;

    await env.stockly.prepare(query).bind(...bindings).run();
  } catch (error) {
    console.error("[updateFollowPreferences] Error updating preferences:", error);
    throw error;
  }
}

/**
 * Check if a user follows a senator
 */
export async function isFollowingSenator(
  env: Env,
  userId: string,
  senatorName: string
): Promise<boolean> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT 1 FROM user_senator_follows 
         WHERE user_id = ? AND senator_name = ?`
      )
      .bind(userId, senatorName)
      .first<{ "1": number }>();

    return result !== null;
  } catch (error) {
    console.error("[isFollowingSenator] Error checking follow status:", error);
    throw error;
  }
}

