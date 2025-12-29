/**
 * D1 Database implementation of IDatabase interface
 * Wraps Cloudflare D1Database to implement our abstraction
 */

// D1Database and D1PreparedStatement types are provided by wrangler
// They're available globally in Cloudflare Workers environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CloudflareD1Database = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1PreparedStatement = any;

import type { IDatabase, IDatabasePreparedStatement } from './IDatabase';

export class D1PreparedStatementWrapper implements IDatabasePreparedStatement {
  constructor(
    private stmt: D1PreparedStatement,
    private query: string,
    private logger?: Logger
  ) {}

  bind(...values: unknown[]): IDatabasePreparedStatement {
    this.stmt = this.stmt.bind(...values) as D1PreparedStatement;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const startTime = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.stmt as any).first() as T | null;
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 first: ${this.query}`, {
        operation: 'd1',
        query: this.query,
        latencyMs,
        cacheStatus: 'N/A' as const,
      });
      return result || null;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 first failed: ${this.query}`, {
        operation: 'd1',
        query: this.query,
        latencyMs,
        cacheStatus: 'N/A',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    const startTime = Date.now();
    try {
      const result = await this.stmt.run();
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 run: ${this.query}`, {
        operation: 'd1',
        query: this.query,
        latencyMs,
        cacheStatus: 'N/A' as const,
      });
      return {
        success: result.success,
        meta: {
          changes: result.meta.changes,
          last_row_id: result.meta.last_row_id,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 run failed: ${this.query}`, {
        operation: 'd1',
        query: this.query,
        latencyMs,
        cacheStatus: 'N/A',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const startTime = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.stmt as any).all() as { results: T[] };
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 all: ${this.query}`, {
        operation: 'd1',
        query: this.query,
        latencyMs,
        cacheStatus: 'N/A' as const,
      });
      return { results: result.results };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 all failed: ${this.query}`, {
        operation: 'd1',
        query: this.query,
        latencyMs,
        cacheStatus: 'N/A',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

import type { Logger } from '../../logging/logger';

export class D1DatabaseWrapper implements IDatabase {
  constructor(
    private db: CloudflareD1Database,
    private logger?: Logger
  ) {}

  prepare(query: string): IDatabasePreparedStatement {
    const stmt = this.db.prepare(query);
    return new D1PreparedStatementWrapper(stmt, query, this.logger);
  }

  async exec(query: string): Promise<{ success: boolean }> {
    const startTime = Date.now();
    try {
      const result = await this.db.exec(query);
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 exec: ${query}`, {
        operation: 'd1',
        query,
        latencyMs,
        cacheStatus: 'N/A',
      });
      return { success: result.success };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 exec failed: ${query}`, {
        operation: 'd1',
        query,
        latencyMs,
        cacheStatus: 'N/A',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async batch<T = unknown>(statements: IDatabasePreparedStatement[]): Promise<{ results: T[] }[]> {
    const startTime = Date.now();
    try {
      // Convert our interface statements back to D1 statements for batch
      // Note: This is a limitation - in practice, we'd need to store the original D1 statements
      // For now, this is a placeholder that shows the pattern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d1Statements = statements as unknown as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (this.db as any).batch(d1Statements) as Array<{ results: T[] }>;
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 batch: ${statements.length} statements`, {
        operation: 'd1',
        query: `${statements.length} statements`,
        latencyMs,
        cacheStatus: 'N/A' as const,
      });
      return results.map((r: { results: T[] }) => ({ results: r.results }));
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger?.logDataOperation(`D1 batch failed`, {
        operation: 'd1',
        query: `${statements.length} statements`,
        latencyMs,
        cacheStatus: 'N/A' as const,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// Export with alias to avoid naming conflict
export { D1DatabaseWrapper as D1Database };

