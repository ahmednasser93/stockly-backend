import type { IFavoriteStocksRepository } from '../repositories/interfaces/IFavoriteStocksRepository';
import type { FavoriteStock, UserFavoriteStocks } from '@stockly/shared/types';

export class FavoriteStocksService {
  constructor(private favoriteStocksRepo: IFavoriteStocksRepository) {}

  async getFavoriteStocks(username: string): Promise<FavoriteStock[]> {
    if (!username) {
      throw new Error('Username is required');
    }
    return this.favoriteStocksRepo.getFavoriteStocks(username);
  }

  async updateFavoriteStocks(username: string, symbols: string[]): Promise<FavoriteStock[]> {
    if (!username) {
      throw new Error('Username is required');
    }

    // Normalize and validate symbols
    const normalizedSymbols = symbols
      .map((s) => {
        if (typeof s !== 'string') return null;
        const normalized = s.trim().toUpperCase();
        return normalized.length > 0 ? normalized : null;
      })
      .filter((s): s is string => s !== null && s.length > 0);

    // Remove duplicates
    const uniqueSymbols = Array.from(new Set(normalizedSymbols));

    return this.favoriteStocksRepo.updateFavoriteStocks(username, uniqueSymbols);
  }

  async deleteFavoriteStock(username: string, symbol: string): Promise<boolean> {
    if (!username) {
      throw new Error('Username is required');
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      throw new Error('Invalid symbol');
    }

    return this.favoriteStocksRepo.deleteFavoriteStock(username, normalizedSymbol);
  }

  async getAllUsersFavoriteStocks(): Promise<UserFavoriteStocks[]> {
    return this.favoriteStocksRepo.getAllUsersFavoriteStocks();
  }
}

