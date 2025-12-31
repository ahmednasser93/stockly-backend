import type { ICommonStocksRepository } from '../repositories/interfaces/ICommonStocksRepository';
import type { CommonStock } from '@stockly/shared/types';

export class CommonStocksService {
  constructor(private commonStocksRepo: ICommonStocksRepository) {}

  async getAllActiveStocks(): Promise<CommonStock[]> {
    return this.commonStocksRepo.getAllActiveStocks();
  }

  async getAllStocks(): Promise<CommonStock[]> {
    return this.commonStocksRepo.getAllStocks();
  }

  async getStockBySymbol(symbol: string): Promise<CommonStock | null> {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Symbol is required');
    }
    const normalizedSymbol = symbol.trim().toUpperCase();
    return this.commonStocksRepo.getStockBySymbol(normalizedSymbol);
  }

  async addStock(symbol: string, data: { name?: string; exchange?: string }): Promise<CommonStock> {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Symbol is required');
    }
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      throw new Error('Symbol cannot be empty');
    }

    // Check if stock already exists
    const existing = await this.commonStocksRepo.getStockBySymbol(normalizedSymbol);
    if (existing) {
      throw new Error(`Stock with symbol ${normalizedSymbol} already exists`);
    }

    return this.commonStocksRepo.addStock(normalizedSymbol, data);
  }

  async updateStock(
    symbol: string,
    data: { name?: string; exchange?: string; isActive?: boolean }
  ): Promise<CommonStock> {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Symbol is required');
    }
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      throw new Error('Symbol cannot be empty');
    }

    // Check if stock exists
    const existing = await this.commonStocksRepo.getStockBySymbol(normalizedSymbol);
    if (!existing) {
      throw new Error(`Stock with symbol ${normalizedSymbol} not found`);
    }

    return this.commonStocksRepo.updateStock(normalizedSymbol, data);
  }

  async removeStock(symbol: string): Promise<boolean> {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Symbol is required');
    }
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      throw new Error('Symbol cannot be empty');
    }

    // Check if stock exists
    const existing = await this.commonStocksRepo.getStockBySymbol(normalizedSymbol);
    if (!existing) {
      throw new Error(`Stock with symbol ${normalizedSymbol} not found`);
    }

    return this.commonStocksRepo.removeStock(normalizedSymbol);
  }

  async bulkAddStocks(
    stocks: Array<{ symbol: string; name?: string; exchange?: string }>
  ): Promise<{ added: number; skipped: number; errors: string[] }> {
    if (!Array.isArray(stocks)) {
      throw new Error('Stocks must be an array');
    }

    // Normalize symbols
    const normalizedStocks = stocks.map((stock) => ({
      symbol: stock.symbol.trim().toUpperCase(),
      name: stock.name?.trim() || undefined,
      exchange: stock.exchange?.trim() || undefined,
    }));

    return this.commonStocksRepo.bulkAddStocks(normalizedStocks);
  }

  async getStocksCount(activeOnly: boolean = true): Promise<number> {
    return this.commonStocksRepo.getStocksCount(activeOnly);
  }
}

