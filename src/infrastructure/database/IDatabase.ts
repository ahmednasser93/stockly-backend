/**
 * Database interface for dependency inversion
 * Allows services to depend on abstractions, not concrete D1 implementations
 */

export interface IDatabasePreparedStatement {
  bind(...values: unknown[]): IDatabasePreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

export interface IDatabase {
  prepare(query: string): IDatabasePreparedStatement;
  exec(query: string): Promise<{ success: boolean }>;
  batch<T = unknown>(statements: IDatabasePreparedStatement[]): Promise<{ results: T[] }[]>;
}

