/**
 * Calendar Repository Implementation
 * Fetches calendar events (earnings, dividends, IPOs, splits) from FMP API
 */

import { API_KEY } from '../../util';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import type { DatalakeService } from '../../services/datalake.service';

export interface CalendarEvent {
  symbol: string;
  date: string;
  [key: string]: any; // Allow additional fields from FMP
}

export class CalendarRepository {
  constructor(
    private env: Env,
    private logger?: Logger,
    private datalakeService?: DatalakeService
  ) {}

  /**
   * Get adapter for an endpoint, with fallback to direct FMP if datalake service not available
   */
  private async getAdapter(endpointId: string): Promise<import('../../infrastructure/datalake/DatalakeAdapter').DatalakeAdapter | null> {
    if (!this.datalakeService) return null;
    const envApiKey = this.env.FMP_API_KEY || API_KEY;
    return this.datalakeService.getAdapterForEndpoint(endpointId, envApiKey);
  }


  /**
   * Fetch earnings calendar using datalake adapter
   */
  async getEarningsCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
    try {
      const adapter = await this.getAdapter('earning-calendar');
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;

      let data: any;
      if (adapter) {
        data = await adapter.fetch('/earning_calendar', params);
      } else {
        // Fallback to direct FMP
        const { API_URL, API_KEY } = await import('../../util');
        const apiKey = this.env.FMP_API_KEY ?? API_KEY;
        let url = `${API_URL}/earning_calendar?apikey=${apiKey}`;
        if (from) url += `&from=${from}`;
        if (to) url += `&to=${to}`;
        const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logger?.error('Failed to fetch earnings calendar', error);
      throw error;
    }
  }

  /**
   * Fetch dividend calendar using datalake adapter
   */
  async getDividendCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
    try {
      const adapter = await this.getAdapter('dividend-calendar');
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;

      let data: any;
      if (adapter) {
        data = await adapter.fetch('/stock_dividend_calendar', params);
      } else {
        // Fallback to direct FMP
        const { API_URL, API_KEY } = await import('../../util');
        const apiKey = this.env.FMP_API_KEY ?? API_KEY;
        let url = `${API_URL}/stock_dividend_calendar?apikey=${apiKey}`;
        if (from) url += `&from=${from}`;
        if (to) url += `&to=${to}`;
        const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logger?.error('Failed to fetch dividend calendar', error);
      throw error;
    }
  }

  /**
   * Fetch IPO calendar using datalake adapter
   */
  async getIPOCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
    try {
      const adapter = await this.getAdapter('ipo-calendar');
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;

      let data: any;
      if (adapter) {
        data = await adapter.fetch('/ipo_calendar', params);
      } else {
        // Fallback to direct FMP
        const { API_URL, API_KEY } = await import('../../util');
        const apiKey = this.env.FMP_API_KEY ?? API_KEY;
        let url = `${API_URL}/ipo_calendar?apikey=${apiKey}`;
        if (from) url += `&from=${from}`;
        if (to) url += `&to=${to}`;
        const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logger?.error('Failed to fetch IPO calendar', error);
      throw error;
    }
  }

  /**
   * Fetch stock split calendar using datalake adapter
   */
  async getStockSplitCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
    try {
      const adapter = await this.getAdapter('stock-split-calendar');
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;

      let data: any;
      if (adapter) {
        data = await adapter.fetch('/stock_split_calendar', params);
      } else {
        // Fallback to direct FMP
        const { API_URL, API_KEY } = await import('../../util');
        const apiKey = this.env.FMP_API_KEY ?? API_KEY;
        let url = `${API_URL}/stock_split_calendar?apikey=${apiKey}`;
        if (from) url += `&from=${from}`;
        if (to) url += `&to=${to}`;
        const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logger?.error('Failed to fetch stock split calendar', error);
      throw error;
    }
  }
}

