import { describe, it, expect, beforeEach, vi } from "vitest";
import { LoggedD1Database } from "../../src/logging/d1-wrapper";
import { Logger } from "../../src/logging/logger";

describe("LoggedD1Database", () => {
  let mockDb: D1Database;
  let logger: Logger;
  let loggedDb: LoggedD1Database;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn(),
      exec: vi.fn(),
      batch: vi.fn(),
    } as unknown as D1Database;

    logger = new Logger({
      traceId: "test-trace",
      userId: null,
      path: "/test",
      service: "test",
    });

    loggedDb = new LoggedD1Database(mockDb, logger);
  });

  describe("prepare", () => {
    it("should wrap prepared statement", () => {
      const mockStmt = {
        bind: vi.fn(),
        first: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      };
      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt as any);

      const result = loggedDb.prepare("SELECT * FROM alerts");

      expect(mockDb.prepare).toHaveBeenCalledWith("SELECT * FROM alerts");
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("bind");
      expect(result).toHaveProperty("first");
      expect(result).toHaveProperty("all");
      expect(result).toHaveProperty("run");
    });
  });

  describe("exec", () => {
    it("should log successful exec operation", async () => {
      const mockResult = { success: true };
      vi.mocked(mockDb.exec).mockResolvedValue(mockResult as any);

      const result = await loggedDb.exec("SELECT * FROM alerts");

      expect(result).toBe(mockResult);
      expect(mockDb.exec).toHaveBeenCalledWith("SELECT * FROM alerts");
      
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "d1",
        query: "SELECT * FROM alerts",
        cacheStatus: "N/A",
      });
      expect(logs[0]).toHaveProperty("latencyMs");
      expect(logs[0].latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should log failed exec operation", async () => {
      const error = new Error("Database error");
      vi.mocked(mockDb.exec).mockRejectedValue(error);

      await expect(loggedDb.exec("SELECT * FROM alerts")).rejects.toThrow("Database error");

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "d1",
        query: "SELECT * FROM alerts",
        error: "Database error",
      });
    });
  });

  describe("batch", () => {
    it("should log successful batch operation", async () => {
      const mockStatements = [{}, {}] as any[];
      const mockResults = [{ success: true }, { success: true }];
      vi.mocked(mockDb.batch).mockResolvedValue(mockResults as any);

      const result = await loggedDb.batch(mockStatements);

      expect(result).toBe(mockResults);
      expect(mockDb.batch).toHaveBeenCalledWith(mockStatements);
      
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        type: "data_operation",
        operation: "d1",
        query: "BATCH(2 statements)",
      });
    });

    it("should log failed batch operation", async () => {
      const mockStatements = [{}, {}] as any[];
      const error = new Error("Batch failed");
      vi.mocked(mockDb.batch).mockRejectedValue(error);

      await expect(loggedDb.batch(mockStatements)).rejects.toThrow("Batch failed");

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        error: "Batch failed",
      });
    });
  });

  describe("LoggedD1PreparedStatement", () => {
    let mockStmt: any;
    let loggedStmt: any;

    beforeEach(() => {
      mockStmt = {
        bind: vi.fn(),
        first: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      };
      vi.mocked(mockDb.prepare).mockReturnValue(mockStmt);
      loggedStmt = loggedDb.prepare("SELECT * FROM alerts WHERE id = ?");
    });

    describe("bind", () => {
      it("should chain bind calls", () => {
        const boundStmt = { first: vi.fn() };
        vi.mocked(mockStmt.bind).mockReturnValue(boundStmt);

        const result = loggedStmt.bind("alert-123");

        expect(mockStmt.bind).toHaveBeenCalledWith("alert-123");
        expect(result).toBeInstanceOf(Object);
        expect(result).toHaveProperty("first");
      });

      it("should support multiple bind calls", () => {
        const boundStmt1 = { bind: vi.fn(), first: vi.fn() };
        const boundStmt2 = { first: vi.fn() };
        vi.mocked(mockStmt.bind).mockReturnValue(boundStmt1);
        vi.mocked(boundStmt1.bind).mockReturnValue(boundStmt2);

        const result = loggedStmt.bind("alert-123").bind("extra");

        expect(mockStmt.bind).toHaveBeenCalledWith("alert-123");
        expect(boundStmt1.bind).toHaveBeenCalledWith("extra");
      });
    });

    describe("first", () => {
      it("should log successful first operation", async () => {
        const mockResult = { id: "alert-123" };
        vi.mocked(mockStmt.first).mockResolvedValue(mockResult);

        const result = await loggedStmt.first();

        expect(result).toBe(mockResult);
        expect(mockStmt.first).toHaveBeenCalled();
        
        const logs = logger.getLogs();
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          type: "data_operation",
          operation: "d1",
          query: "SELECT * FROM alerts WHERE id = ?",
          cacheStatus: "N/A",
        });
        expect(logs[0]).toHaveProperty("latencyMs");
      });

      it("should log failed first operation", async () => {
        const error = new Error("Query failed");
        vi.mocked(mockStmt.first).mockRejectedValue(error);

        await expect(loggedStmt.first()).rejects.toThrow("Query failed");

        const logs = logger.getLogs();
        expect(logs[0]).toMatchObject({
          error: "Query failed",
        });
      });
    });

    describe("all", () => {
      it("should log successful all operation", async () => {
        const mockResult = { results: [{ id: "1" }, { id: "2" }] };
        vi.mocked(mockStmt.all).mockResolvedValue(mockResult);

        const result = await loggedStmt.all();

        expect(result).toBe(mockResult);
        expect(mockStmt.all).toHaveBeenCalled();
        
        const logs = logger.getLogs();
        expect(logs[0]).toMatchObject({
          type: "data_operation",
          operation: "d1",
          query: "SELECT * FROM alerts WHERE id = ?",
        });
      });

      it("should log failed all operation", async () => {
        const error = new Error("Query failed");
        vi.mocked(mockStmt.all).mockRejectedValue(error);

        await expect(loggedStmt.all()).rejects.toThrow("Query failed");

        const logs = logger.getLogs();
        expect(logs[0]).toMatchObject({
          error: "Query failed",
        });
      });
    });

    describe("run", () => {
      it("should log successful run operation", async () => {
        const mockResult = { success: true, meta: { changes: 1 } };
        vi.mocked(mockStmt.run).mockResolvedValue(mockResult);

        const result = await loggedStmt.run();

        expect(result).toBe(mockResult);
        expect(mockStmt.run).toHaveBeenCalled();
        
        const logs = logger.getLogs();
        expect(logs[0]).toMatchObject({
          type: "data_operation",
          operation: "d1",
          query: "SELECT * FROM alerts WHERE id = ?",
        });
      });

      it("should log failed run operation", async () => {
        const error = new Error("Update failed");
        vi.mocked(mockStmt.run).mockRejectedValue(error);

        await expect(loggedStmt.run()).rejects.toThrow("Update failed");

        const logs = logger.getLogs();
        expect(logs[0]).toMatchObject({
          error: "Update failed",
        });
      });
    });

    describe("latency measurement", () => {
      it("should measure latency accurately", async () => {
        vi.mocked(mockStmt.first).mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({}), 10))
        );

        await loggedStmt.first();

        const logs = logger.getLogs();
        expect(logs[0].latencyMs).toBeGreaterThanOrEqual(10);
        expect(logs[0].latencyMs).toBeLessThan(50); // Should be close to 10ms
      });
    });

    describe("error propagation", () => {
      it("should re-throw errors after logging", async () => {
        const error = new Error("Database error");
        vi.mocked(mockStmt.first).mockRejectedValue(error);

        await expect(loggedStmt.first()).rejects.toThrow(error);

        const logs = logger.getLogs();
        expect(logs).toHaveLength(1);
      });
    });
  });
});

