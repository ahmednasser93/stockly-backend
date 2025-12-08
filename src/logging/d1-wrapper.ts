/**
 * D1 Database Wrapper with Logging
 * 
 * Wraps D1 operations to automatically log latency and cache status.
 */

import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import type { Logger } from "./logger";

/**
 * Wrapped D1 database that logs all operations
 */
export class LoggedD1Database {
  constructor(
    private db: D1Database,
    private logger: Logger
  ) {}

  prepare(query: string): LoggedD1PreparedStatement {
    const stmt = this.db.prepare(query);
    return new LoggedD1PreparedStatement(stmt, query, this.logger);
  }

  // Delegate other D1Database methods
  exec(query: string): Promise<D1Result> {
    const startTime = Date.now();
    return this.db.exec(query).then((result) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 exec: ${query}`, {
        operation: "d1",
        query,
        latencyMs,
        cacheStatus: "N/A",
      });
      return result;
    }).catch((error) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 exec failed: ${query}`, {
        operation: "d1",
        query,
        latencyMs,
        cacheStatus: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const startTime = Date.now();
    const query = `BATCH(${statements.length} statements)`;
    return this.db.batch(statements).then((results) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 batch: ${query}`, {
        operation: "d1",
        query,
        latencyMs,
        cacheStatus: "N/A",
      });
      return results;
    }).catch((error) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 batch failed: ${query}`, {
        operation: "d1",
        query,
        latencyMs,
        cacheStatus: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }
}

/**
 * Wrapped D1 prepared statement that logs execution
 */
class LoggedD1PreparedStatement {
  constructor(
    private stmt: D1PreparedStatement,
    private query: string,
    private logger: Logger
  ) {}

  bind(...values: unknown[]): LoggedD1PreparedStatement {
    const boundStmt = this.stmt.bind(...values);
    return new LoggedD1PreparedStatement(boundStmt, this.query, this.logger);
  }

  first<T = unknown>(): Promise<T | null> {
    const startTime = Date.now();
    return this.stmt.first<T>().then((result) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 first: ${this.query}`, {
        operation: "d1",
        query: this.query,
        latencyMs,
        cacheStatus: "N/A",
      });
      return result;
    }).catch((error) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 first failed: ${this.query}`, {
        operation: "d1",
        query: this.query,
        latencyMs,
        cacheStatus: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }

  run(): Promise<D1Result> {
    const startTime = Date.now();
    return this.stmt.run().then((result) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 run: ${this.query}`, {
        operation: "d1",
        query: this.query,
        latencyMs,
        cacheStatus: "N/A",
      });
      return result;
    }).catch((error) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 run failed: ${this.query}`, {
        operation: "d1",
        query: this.query,
        latencyMs,
        cacheStatus: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }

  all<T = unknown>(): Promise<D1Result<T>> {
    const startTime = Date.now();
    return this.stmt.all<T>().then((result) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 all: ${this.query}`, {
        operation: "d1",
        query: this.query,
        latencyMs,
        cacheStatus: "N/A",
      });
      return result;
    }).catch((error) => {
      const latencyMs = Date.now() - startTime;
      this.logger.logDataOperation(`D1 all failed: ${this.query}`, {
        operation: "d1",
        query: this.query,
        latencyMs,
        cacheStatus: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }
}


