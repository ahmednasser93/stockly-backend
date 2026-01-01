/**
 * Service for House Trading business logic
 * Coordinates between repositories and external APIs
 */

import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import { fetchHouseTradingFromFmp } from "../api/senate-trading";
import * as HouseTradingRepository from "../repositories/house-trading.repository";
import type {
  HouseTrade,
  HouseTradeRecord,
  HouseTradingFilter,
} from "../house-trading/types";

export class HouseTradingService {
  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  /**
   * Sync house trades from FMP API
   * Fetches new trades and stores them in the database
   * Uses pagination to fetch multiple pages if needed
   */
  async syncHouseTrades(): Promise<{ added: number; updated: number; errors: number }> {
    this.logger.info("Starting house trades sync from FMP API");

    let added = 0;
    let updated = 0;
    let errors = 0;

    try {
      // Fetch trades from FMP using pagination
      // Start with page 0, limit 100 (as recommended by FMP API)
      let page = 0;
      const limit = 100;
      let allFmpTrades: HouseTrade[] = [];
      let hasMore = true;

      while (hasMore) {
        const fmpTrades = await fetchHouseTradingFromFmp(this.env, page, limit);
        allFmpTrades = allFmpTrades.concat(fmpTrades);
        this.logger.info(`Fetched page ${page}: ${fmpTrades.length} trades from FMP API`);

        // If we got fewer trades than the limit, we've reached the end
        if (fmpTrades.length < limit) {
          hasMore = false;
        } else {
          page++;
          // Limit to fetching first 5 pages (500 trades max per sync) to avoid rate limits
          if (page >= 5) {
            hasMore = false;
            this.logger.info("Reached maximum page limit (5 pages), stopping pagination");
          }
        }
      }

      this.logger.info(`Fetched total ${allFmpTrades.length} trades from FMP API across ${page + 1} page(s)`);

      for (const fmpTrade of allFmpTrades) {
        try {
          // Check if trade already exists by fmp_id
          let existingTrade: HouseTradeRecord | null = null;
          if (fmpTrade.fmpId) {
            existingTrade = await HouseTradingRepository.getTradeByFmpId(
              this.env,
              fmpTrade.fmpId
            );
          }

          // Generate ID if not exists
          const tradeId = existingTrade?.id || crypto.randomUUID();

          // Create trade record
          const tradeRecord: HouseTradeRecord = {
            id: tradeId,
            symbol: fmpTrade.symbol,
            representativeName: fmpTrade.representativeName,
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
          await HouseTradingRepository.upsertTrade(this.env, tradeRecord);

          if (existingTrade) {
            updated++;
          } else {
            added++;
          }
        } catch (error) {
          errors++;
          this.logger.error("Error processing trade", error, {
            symbol: fmpTrade.symbol,
            representative: fmpTrade.representativeName,
          });
        }
      }

      this.logger.info("House trades sync completed", {
        added,
        updated,
        errors,
        total: allFmpTrades.length,
      });

      return { added, updated, errors };
    } catch (error) {
      this.logger.error("Error syncing house trades", error);
      throw error;
    }
  }

  /**
   * Get trades feed with optional filters
   */
  async getTradesFeed(filters?: HouseTradingFilter): Promise<HouseTradeRecord[]> {
    try {
      if (filters) {
        return await HouseTradingRepository.getTradesWithFilters(this.env, filters);
      }
      return await HouseTradingRepository.getRecentTrades(this.env, filters?.limit || 100);
    } catch (error) {
      this.logger.error("Error getting trades feed", error);
      throw error;
    }
  }

  /**
   * Get list of all unique representatives
   */
  async getRepresentativesList(): Promise<string[]> {
    try {
      return await HouseTradingRepository.getAllRepresentatives(this.env);
    } catch (error) {
      this.logger.error("Error getting representatives list", error);
      throw error;
    }
  }

  /**
   * Get popular representatives by most trades (last 90 days)
   */
  async getPopularRepresentativesByTrades(
    limit: number = 10
  ): Promise<Array<{ representativeName: string; tradeCount: number }>> {
    try {
      return await HouseTradingRepository.getPopularRepresentativesByTrades(this.env, limit);
    } catch (error) {
      this.logger.error("Error getting popular representatives by trades", error);
      throw error;
    }
  }

  /**
   * Search representatives by name (autocomplete)
   * Uses local database search
   */
  async searchRepresentatives(query: string, limit: number = 20): Promise<string[]> {
    try {
      return await HouseTradingRepository.searchRepresentatives(this.env, query, limit);
    } catch (error) {
      this.logger.error("Error searching representatives", error, { query });
      throw error;
    }
  }

  /**
   * Get trades for a specific symbol
   */
  async getTradesBySymbol(symbol: string, limit?: number): Promise<HouseTradeRecord[]> {
    try {
      return await HouseTradingRepository.getTradesBySymbol(
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
   * Get trades for a specific representative
   */
  async getTradesByRepresentative(representativeName: string, limit?: number): Promise<HouseTradeRecord[]> {
    try {
      return await HouseTradingRepository.getTradesByRepresentative(
        this.env,
        representativeName,
        limit || 100
      );
    } catch (error) {
      this.logger.error("Error getting trades by representative", error, { representativeName });
      throw error;
    }
  }
}

