import type { ICommonStocksRepository } from '../interfaces/ICommonStocksRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { CommonStock } from '@stockly/shared/types';

type CommonStockRow = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  added_at: number;
  is_active: number;
};

export class CommonStocksRepository implements ICommonStocksRepository {
  constructor(private db: IDatabase) {}

  private mapRowToCommonStock(row: CommonStockRow): CommonStock {
    return {
      symbol: row.symbol,
      name: row.name || null,
      exchange: row.exchange || null,
      addedAt: row.added_at,
      isActive: row.is_active === 1,
    };
  }

  async getAllActiveStocks(): Promise<CommonStock[]> {
    const rows = await this.db
      .prepare(
        `SELECT symbol, name, exchange, added_at, is_active
         FROM common_stocks
         WHERE is_active = 1
         ORDER BY symbol ASC`
      )
      .all<CommonStockRow>();

    return (rows.results || []).map((row) => this.mapRowToCommonStock(row));
  }

  async getAllStocks(): Promise<CommonStock[]> {
    const rows = await this.db
      .prepare(
        `SELECT symbol, name, exchange, added_at, is_active
         FROM common_stocks
         ORDER BY symbol ASC`
      )
      .all<CommonStockRow>();

    return (rows.results || []).map((row) => this.mapRowToCommonStock(row));
  }

  async getStockBySymbol(symbol: string): Promise<CommonStock | null> {
    const row = await this.db
      .prepare(
        `SELECT symbol, name, exchange, added_at, is_active
         FROM common_stocks
         WHERE symbol = ?`
      )
      .bind(symbol.toUpperCase())
      .first<CommonStockRow>();

    return row ? this.mapRowToCommonStock(row) : null;
  }

  async updateStock(
    symbol: string,
    data: { name?: string; exchange?: string; isActive?: boolean }
  ): Promise<CommonStock> {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name || null);
    }
    if (data.exchange !== undefined) {
      updates.push('exchange = ?');
      values.push(data.exchange || null);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      // No updates, just return existing stock
      const existing = await this.getStockBySymbol(symbol);
      if (!existing) {
        throw new Error(`Stock with symbol ${symbol} not found`);
      }
      return existing;
    }

    values.push(symbol.toUpperCase());

    const query = `UPDATE common_stocks SET ${updates.join(', ')} WHERE symbol = ?`;
    await this.db.prepare(query).bind(...values).run();

    const updated = await this.getStockBySymbol(symbol);
    if (!updated) {
      throw new Error(`Stock with symbol ${symbol} not found after update`);
    }
    return updated;
  }

  async addStock(
    symbol: string,
    data: { name?: string; exchange?: string }
  ): Promise<CommonStock> {
    const now = Math.floor(Date.now() / 1000);
    const upperSymbol = symbol.toUpperCase();

    await this.db
      .prepare(
        `INSERT INTO common_stocks (symbol, name, exchange, added_at, is_active)
         VALUES (?, ?, ?, ?, 1)`
      )
      .bind(upperSymbol, data.name || null, data.exchange || null, now)
      .run();

    const added = await this.getStockBySymbol(upperSymbol);
    if (!added) {
      throw new Error(`Failed to retrieve added stock ${upperSymbol}`);
    }
    return added;
  }

  async removeStock(symbol: string): Promise<boolean> {
    const result = await this.updateStock(symbol, { isActive: false });
    return !result.isActive;
  }

  async bulkAddStocks(
    stocks: Array<{ symbol: string; name?: string; exchange?: string }>
  ): Promise<{ added: number; skipped: number; errors: string[] }> {
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const stock of stocks) {
      try {
        const upperSymbol = stock.symbol.toUpperCase();
        
        // Check if stock already exists
        const existing = await this.getStockBySymbol(upperSymbol);
        if (existing) {
          skipped++;
          continue;
        }

        // Add the stock
        await this.db
          .prepare(
            `INSERT INTO common_stocks (symbol, name, exchange, added_at, is_active)
             VALUES (?, ?, ?, ?, 1)`
          )
          .bind(upperSymbol, stock.name || null, stock.exchange || null, now)
          .run();

        added++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${stock.symbol}: ${errorMsg}`);
      }
    }

    return { added, skipped, errors };
  }

  async getStocksCount(activeOnly: boolean = true): Promise<number> {
    const query = activeOnly
      ? `SELECT COUNT(*) as count FROM common_stocks WHERE is_active = 1`
      : `SELECT COUNT(*) as count FROM common_stocks`;
    
    const result = await this.db
      .prepare(query)
      .first<{ count: number }>();

    return result?.count || 0;
  }
}

