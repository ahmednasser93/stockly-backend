/**
 * Service for Senate Trading business logic
 * Coordinates between repositories and external APIs
 */

import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import { fetchSenateTradingFromFmp } from "../api/senate-trading";
import * as SenateTradingRepository from "../repositories/senate-trading.repository";
import * as UserSenatorFollowsRepository from "../repositories/user-senator-follows.repository";
import type {
  SenateTrade,
  SenateTradeRecord,
  SenateTradingFilter,
  UserSenatorFollow,
  SenatorFollowPreferences,
} from "../senate-trading/types";
import { formatSenatorAlertMessage } from "../senate-trading/models";

export class SenateTradingService {
  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  /**
   * Sync senate trades from FMP API
   * Fetches new trades and stores them in the database
   */
  async syncSenateTrades(): Promise<{ added: number; updated: number; errors: number }> {
    this.logger.info("Starting senate trades sync from FMP API");

    let added = 0;
    let updated = 0;
    let errors = 0;

    try {
      // Fetch all trades from FMP (no symbol filter to get everything)
      const fmpTrades = await fetchSenateTradingFromFmp(undefined, this.env);
      this.logger.info(`Fetched ${fmpTrades.length} trades from FMP API`);

      for (const fmpTrade of fmpTrades) {
        try {
          // Check if trade already exists by fmp_id
          let existingTrade: SenateTradeRecord | null = null;
          if (fmpTrade.fmpId) {
            existingTrade = await SenateTradingRepository.getTradeByFmpId(
              this.env,
              fmpTrade.fmpId
            );
          }

          // Generate ID if not exists
          const tradeId = existingTrade?.id || crypto.randomUUID();

          // Create trade record
          const tradeRecord: SenateTradeRecord = {
            id: tradeId,
            symbol: fmpTrade.symbol,
            senatorName: fmpTrade.senatorName,
            transactionType: fmpTrade.transactionType,
            amountRangeMin: fmpTrade.amountRangeMin ?? null,
            amountRangeMax: fmpTrade.amountRangeMax ?? null,
            disclosureDate: fmpTrade.disclosureDate,
            transactionDate: fmpTrade.transactionDate ?? null,
            fmpId: fmpTrade.fmpId ?? null,
            createdAt: existingTrade?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Upsert trade
          await SenateTradingRepository.upsertTrade(this.env, tradeRecord);

          if (existingTrade) {
            updated++;
          } else {
            added++;
          }
        } catch (error) {
          errors++;
          this.logger.error("Error processing trade", error, {
            symbol: fmpTrade.symbol,
            senator: fmpTrade.senatorName,
          });
        }
      }

      this.logger.info("Senate trades sync completed", {
        added,
        updated,
        errors,
        total: fmpTrades.length,
      });

      return { added, updated, errors };
    } catch (error) {
      this.logger.error("Error syncing senate trades", error);
      throw error;
    }
  }

  /**
   * Get trades feed with optional filters
   */
  async getTradesFeed(filters?: SenateTradingFilter): Promise<SenateTradeRecord[]> {
    try {
      if (filters) {
        return await SenateTradingRepository.getTradesWithFilters(this.env, filters);
      }
      return await SenateTradingRepository.getRecentTrades(this.env, filters?.limit || 100);
    } catch (error) {
      this.logger.error("Error getting trades feed", error);
      throw error;
    }
  }

  /**
   * Get list of all unique senators
   */
  async getSenatorsList(): Promise<string[]> {
    try {
      return await SenateTradingRepository.getAllSenators(this.env);
    } catch (error) {
      this.logger.error("Error getting senators list", error);
      throw error;
    }
  }

  /**
   * Get popular senators by most trades (last 90 days)
   */
  async getPopularSenatorsByTrades(
    limit: number = 10
  ): Promise<Array<{ senatorName: string; tradeCount: number }>> {
    try {
      return await SenateTradingRepository.getPopularSenatorsByTrades(this.env, limit);
    } catch (error) {
      this.logger.error("Error getting popular senators by trades", error);
      throw error;
    }
  }

  /**
   * Get popular senators by most followers
   */
  async getPopularSenatorsByFollowers(
    limit: number = 10
  ): Promise<Array<{ senatorName: string; followerCount: number }>> {
    try {
      return await SenateTradingRepository.getPopularSenatorsByFollowers(this.env, limit);
    } catch (error) {
      this.logger.error("Error getting popular senators by followers", error);
      throw error;
    }
  }

  /**
   * Search senators by name (autocomplete)
   */
  async searchSenators(query: string, limit: number = 20): Promise<string[]> {
    try {
      return await SenateTradingRepository.searchSenators(this.env, query, limit);
    } catch (error) {
      this.logger.error("Error searching senators", error, { query });
      throw error;
    }
  }

  /**
   * Get trades for a specific symbol
   */
  async getTradesBySymbol(symbol: string, limit?: number): Promise<SenateTradeRecord[]> {
    try {
      return await SenateTradingRepository.getTradesBySymbol(
        this.env,
        symbol,
        limit || 100
      );
    } catch (error) {
      this.logger.error("Error getting trades by symbol", error, { symbol });
      throw error;
    }
  }

  /**
   * Get trades for a specific senator
   */
  async getTradesBySenator(senatorName: string, limit?: number): Promise<SenateTradeRecord[]> {
    try {
      return await SenateTradingRepository.getTradesBySenator(
        this.env,
        senatorName,
        limit || 100
      );
    } catch (error) {
      this.logger.error("Error getting trades by senator", error, { senatorName });
      throw error;
    }
  }

  /**
   * Get trades since a specific date (for alert evaluation)
   */
  async getTradesSince(sinceDate: string, limit?: number): Promise<SenateTradeRecord[]> {
    try {
      return await SenateTradingRepository.getTradesSince(
        this.env,
        sinceDate,
        limit || 1000
      );
    } catch (error) {
      this.logger.error("Error getting trades since date", error, { sinceDate });
      throw error;
    }
  }

  /**
   * Follow a senator for a user
   */
  async followSenator(
    userId: string,
    username: string,
    senatorName: string,
    preferences: SenatorFollowPreferences
  ): Promise<void> {
    try {
      await UserSenatorFollowsRepository.followSenator(
        this.env,
        userId,
        username,
        senatorName,
        preferences
      );
      this.logger.info("User followed senator", { userId, username, senatorName });
    } catch (error) {
      this.logger.error("Error following senator", error, { userId, senatorName });
      throw error;
    }
  }

  /**
   * Unfollow a senator for a user
   */
  async unfollowSenator(userId: string, senatorName: string): Promise<void> {
    try {
      await UserSenatorFollowsRepository.unfollowSenator(this.env, userId, senatorName);
      this.logger.info("User unfollowed senator", { userId, senatorName });
    } catch (error) {
      this.logger.error("Error unfollowing senator", error, { userId, senatorName });
      throw error;
    }
  }

  /**
   * Get all senators a user follows
   */
  async getUserFollows(userId: string): Promise<UserSenatorFollow[]> {
    try {
      return await UserSenatorFollowsRepository.getUserFollows(this.env, userId);
    } catch (error) {
      this.logger.error("Error getting user follows", error, { userId });
      throw error;
    }
  }

  /**
   * Get all users who follow a specific senator
   */
  async getFollowersOfSenator(senatorName: string): Promise<UserSenatorFollow[]> {
    try {
      return await UserSenatorFollowsRepository.getFollowersOfSenator(this.env, senatorName);
    } catch (error) {
      this.logger.error("Error getting followers of senator", error, { senatorName });
      throw error;
    }
  }

  /**
   * Update follow preferences for a user-senator relationship
   */
  async updateFollowPreferences(
    userId: string,
    senatorName: string,
    preferences: Partial<SenatorFollowPreferences>
  ): Promise<void> {
    try {
      await UserSenatorFollowsRepository.updateFollowPreferences(
        this.env,
        userId,
        senatorName,
        preferences
      );
      this.logger.info("Updated follow preferences", { userId, senatorName, preferences });
    } catch (error) {
      this.logger.error("Error updating follow preferences", error, {
        userId,
        senatorName,
      });
      throw error;
    }
  }
}

