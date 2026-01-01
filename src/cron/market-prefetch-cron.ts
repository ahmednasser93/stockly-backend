/**
 * Market Data & News Prefetch Cron Job
 * Prefetches market data (gainers, losers, actives, sectors) and general news to warm the cache
 * Runs hourly (configurable via AdminConfig, default: "0 * * * *")
 */

import type { Env } from '../index';
import { Logger } from '../logging/logger';
import { sendLogsToLoki } from '../logging/loki-shipper';
import { createMarketService } from '../factories/createMarketService';
import { createNewsService } from '../factories/createNewsService';
import { createCommonStocksService } from '../factories/createCommonStocksService';
import { getConfig } from '../api/config';
import { MarketRepository } from '../repositories/external/MarketRepository';
import { MarketCalculationService } from '../services/market-calculation.service';
import { createDatalakeService } from '../factories/createDatalakeService';
import {
  setMarketDataFullToKV,
  setMarketDataTop50ToKV,
} from '../api/market-cache';

export async function runMarketPrefetchCron(env: Env, ctx?: ExecutionContext): Promise<void> {
  // Create logger for cron job
  const traceId = `cron-market-prefetch-${Date.now()}`;
  const logger = new Logger({
    traceId,
    userId: null,
    path: '/cron/market-prefetch',
    service: 'stockly-api',
  });

  try {
    // Get configurable cron interval from AdminConfig
    const config = await getConfig(env);
    const cronInterval = config.marketCache?.prefetchCronInterval ?? '0 * * * *';
    
    logger.info('Starting market data & news prefetch cron job', {
      configuredInterval: cronInterval,
    });

    const marketService = createMarketService(env, logger);
    const newsService = createNewsService(env, logger);
    const commonStocksService = createCommonStocksService(env, logger);
    // Create MarketRepository with DatalakeService for cron job
    const datalakeService = createDatalakeService(env, logger);
    const marketRepository = new MarketRepository(env, logger, datalakeService);
    const calculationService = new MarketCalculationService();

    if (!env.alertsKv) {
      logger.warn('Market KV (alertsKv) is not configured; skipping market cache update');
    } else {
      // Get 500 common stocks from database
      logger.info('Starting market data prefetch for 500 stocks');
      const commonStocks = await commonStocksService.getAllActiveStocks();
      const symbols = commonStocks.map((stock) => stock.symbol);

      logger.info(`Fetched ${symbols.length} common stocks from database`);

      // Fetch prices for all 500 stocks
      const allStocks = await marketRepository.fetchPricesForStocks(symbols);
      logger.info(`Fetched prices for ${allStocks.length} stocks`);

      // Calculate rankings
      const gainers = calculationService.calculateGainers(allStocks);
      const losers = calculationService.calculateLosers(allStocks);
      const actives = calculationService.calculateActives(allStocks);

      logger.info(`Calculated top gainers/losers/actives`, {
        gainersCount: gainers.length,
        losersCount: losers.length,
        activesCount: actives.length,
      });

      // Store full lists and top 50 slices in cache
      // Note: config is already defined above (line 34)
      const cachePromises = [
        setMarketDataFullToKV(env.alertsKv, 'market:gainers:full', gainers, config, 3600).then(() => {
          logger.info('Cached gainers full list');
        }),
        setMarketDataTop50ToKV(env.alertsKv, 'market:gainers:top50', gainers, config, 3600).then(() => {
          logger.info('Cached gainers top 50');
        }),
        setMarketDataFullToKV(env.alertsKv, 'market:losers:full', losers, config, 3600).then(() => {
          logger.info('Cached losers full list');
        }),
        setMarketDataTop50ToKV(env.alertsKv, 'market:losers:top50', losers, config, 3600).then(() => {
          logger.info('Cached losers top 50');
        }),
        setMarketDataFullToKV(env.alertsKv, 'market:actives:full', actives, config, 3600).then(() => {
          logger.info('Cached actives full list');
        }),
        setMarketDataTop50ToKV(env.alertsKv, 'market:actives:top50', actives, config, 3600).then(() => {
          logger.info('Cached actives top 50');
        }),
      ];

      await Promise.allSettled(cachePromises);
      logger.info('Market cache updated successfully');
    }

    // Prefetch sectors and news (still useful for other features)
    const prefetchPromises = [
      marketService.getSectorsPerformance().catch(error => {
        logger.warn('Failed to prefetch sectors performance', error);
        return [];
      }),
      newsService.getGeneralNews({ limit: 20 }).catch(error => {
        logger.warn('Failed to prefetch general news', error);
        return { news: [], pagination: { page: 0, limit: 20, total: 0, hasMore: false } };
      }),
    ];

    const results = await Promise.allSettled(prefetchPromises);

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    logger.info('Market data & news prefetch completed', {
      successCount,
      total: results.length,
      configuredInterval: cronInterval,
    });

    // Ship logs asynchronously
    if (env.LOKI_URL && ctx) {
      ctx.waitUntil(
        sendLogsToLoki(logger.getLogs(), {
          url: env.LOKI_URL,
          username: env.LOKI_USERNAME,
          password: env.LOKI_PASSWORD,
        })
      );
    }
  } catch (error) {
    logger.error('Market prefetch cron job failed', error);

    // Ship error logs
    if (env.LOKI_URL && ctx) {
      ctx.waitUntil(
        sendLogsToLoki(logger.getLogs(), {
          url: env.LOKI_URL,
          username: env.LOKI_USERNAME,
          password: env.LOKI_PASSWORD,
        })
      );
    }
  }
}

