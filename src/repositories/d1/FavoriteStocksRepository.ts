import type { IFavoriteStocksRepository } from '../interfaces/IFavoriteStocksRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { FavoriteStock, UserFavoriteStocks } from '@stockly/shared/types';

type FavoriteStockRow = {
  symbol: string;
  display_order: number;
  created_at: number;
  updated_at: number;
};

type UserFavoriteStocksRow = {
  user_id: string;
  username: string | null;
  symbol: string;
};

export class FavoriteStocksRepository implements IFavoriteStocksRepository {
  constructor(private db: IDatabase) {}

  private mapRowToFavoriteStock(row: FavoriteStockRow): FavoriteStock {
    return {
      symbol: row.symbol,
      displayOrder: row.display_order,
      createdAt: new Date(row.created_at * 1000).toISOString(),
      updatedAt: new Date(row.updated_at * 1000).toISOString(),
    };
  }

  async getFavoriteStocks(username: string): Promise<FavoriteStock[]> {
    const rows = await this.db
      .prepare(
        `SELECT symbol, display_order, created_at, updated_at
         FROM user_favorite_stocks
         WHERE username = ?
         ORDER BY display_order ASC, created_at ASC`
      )
      .bind(username)
      .all<FavoriteStockRow>();

    return (rows.results || []).map((row) => this.mapRowToFavoriteStock(row));
  }

  async updateFavoriteStocks(username: string, symbols: string[]): Promise<FavoriteStock[]> {
    // Get user_id from username (required for foreign key constraint)
    const user = await this.db
      .prepare(`SELECT id FROM users WHERE username = ?`)
      .bind(username)
      .first<{ id: string }>();

    if (!user) {
      throw new Error('User account not found. Please sign in again.');
    }

    const userId = user.id;
    const now = Math.floor(Date.now() / 1000);

    // Delete all existing stocks for this user first
    await this.db
      .prepare(`DELETE FROM user_favorite_stocks WHERE username = ?`)
      .bind(username)
      .run();

    // Insert new stocks with display order
    if (symbols.length > 0) {
      for (let i = 0; i < symbols.length; i++) {
        await this.db
          .prepare(
            `INSERT OR REPLACE INTO user_favorite_stocks (user_id, username, symbol, display_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(userId, username, symbols[i], i, now, now)
          .run();
      }
    }

    // Return the updated stocks
    return symbols.map((symbol, index) => ({
      symbol,
      displayOrder: index,
      createdAt: new Date(now * 1000).toISOString(),
      updatedAt: new Date(now * 1000).toISOString(),
    }));
  }

  async deleteFavoriteStock(username: string, symbol: string): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM user_favorite_stocks WHERE username = ? AND symbol = ?`)
      .bind(username, symbol)
      .run();

    const meta = (result as any)?.meta ?? {};
    return meta.changes > 0;
  }

  async getAllUsersFavoriteStocks(): Promise<UserFavoriteStocks[]> {
    // Get all users with favorite stocks
    const favoriteStocksRows = await this.db
      .prepare(
        `SELECT 
           ufs.user_id,
           u.username,
           ufs.symbol
         FROM user_favorite_stocks ufs
         LEFT JOIN users u ON ufs.user_id = u.id
         WHERE u.username IS NOT NULL
         ORDER BY u.username ASC, ufs.display_order ASC, ufs.created_at ASC`
      )
      .all<UserFavoriteStocksRow>();

    // Get all users with devices
    const usersWithDevices = await this.db
      .prepare(
        `SELECT DISTINCT
           u.id as user_id,
           u.username
         FROM users u
         INNER JOIN devices d ON u.id = d.user_id AND d.is_active = 1
         WHERE u.username IS NOT NULL`
      )
      .all<{ user_id: string; username: string | null }>();

    // Get all users with alerts
    const usersWithAlerts = await this.db
      .prepare(
        `SELECT DISTINCT
           u.id as user_id,
           u.username
         FROM users u
         INNER JOIN alerts a ON a.username = u.username
         WHERE u.username IS NOT NULL`
      )
      .all<{ user_id: string; username: string | null }>();

    // Combine all users
    const allUserIds = new Set<string>();
    const rows: Array<{ user_id: string; username: string | null; symbol: string | null }> = [];

    // Add favorite stocks rows
    for (const row of favoriteStocksRows.results || []) {
      allUserIds.add(row.user_id);
      rows.push({
        user_id: row.user_id,
        username: row.username,
        symbol: row.symbol,
      });
    }

    // Add users with devices
    for (const user of usersWithDevices.results || []) {
      if (!allUserIds.has(user.user_id)) {
        allUserIds.add(user.user_id);
        rows.push({
          user_id: user.user_id,
          username: user.username,
          symbol: null,
        });
      }
    }

    // Add users with alerts
    for (const user of usersWithAlerts.results || []) {
      if (!allUserIds.has(user.user_id)) {
        allUserIds.add(user.user_id);
        rows.push({
          user_id: user.user_id,
          username: user.username,
          symbol: null,
        });
      }
    }

    // Get all unique symbols
    const allSymbols = new Set<string>();
    for (const row of rows) {
      if (row.symbol) {
        allSymbols.add(row.symbol);
      }
    }

    // Check which symbols have news
    const symbolsWithNews = new Set<string>();
    if (allSymbols.size > 0) {
      const symbolsArray = Array.from(allSymbols);
      for (let i = 0; i < symbolsArray.length; i += 50) {
        const batch = symbolsArray.slice(i, i + 50);
        const placeholders = batch.map(() => '?').join(',');
        const newsRows = await this.db
          .prepare(
            `SELECT DISTINCT symbol 
             FROM user_saved_news 
             WHERE symbol IN (${placeholders}) AND symbol IS NOT NULL`
          )
          .bind(...batch)
          .all<{ symbol: string }>();

        for (const newsRow of newsRows.results || []) {
          if (newsRow.symbol) {
            symbolsWithNews.add(newsRow.symbol.toUpperCase());
          }
        }
      }
    }

    // Group by user_id
    const userStocksMap = new Map<string, { username: string | null; stocks: string[] }>();

    for (const row of rows) {
      if (!userStocksMap.has(row.user_id)) {
        userStocksMap.set(row.user_id, {
          username: row.username,
          stocks: [],
        });
      }
      if (row.symbol) {
        userStocksMap.get(row.user_id)!.stocks.push(row.symbol);
      }
    }

    // Convert to array format with news information
    const users: UserFavoriteStocks[] = Array.from(userStocksMap.entries()).map(([userId, data]) => {
      const stocksWithNews = data.stocks.map((symbol) => ({
        symbol,
        hasNews: symbolsWithNews.has(symbol.toUpperCase()),
      }));

      return {
        userId,
        username: data.username || userId,
        stocks: data.stocks,
        stocksWithNews,
        count: data.stocks.length,
      };
    });

    // Sort by username
    users.sort((a, b) => {
      const aName = a.username || a.userId;
      const bName = b.username || b.userId;
      return aName.localeCompare(bName);
    });

    return users;
  }
}

