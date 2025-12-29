import type { FavoriteStock, UserFavoriteStocks } from '@stockly/shared/types';

export interface IFavoriteStocksRepository {
  getFavoriteStocks(username: string): Promise<FavoriteStock[]>;
  updateFavoriteStocks(username: string, symbols: string[]): Promise<FavoriteStock[]>;
  deleteFavoriteStock(username: string, symbol: string): Promise<boolean>;
  getAllUsersFavoriteStocks(): Promise<UserFavoriteStocks[]>;
}

