import { describe, it, expect } from "vitest";
import { validateNewAlert, validateAlertUpdate } from "../src/alerts/validation";

describe("alert validation", () => {
  it("validates creation payloads", () => {
    const result = validateNewAlert({
      symbol: "msft",
      direction: "below",
      threshold: 150,
      channel: "notification",
      target: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      notes: "watch closely",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.symbol).toBe("MSFT");
      expect(result.data.notes).toBe("watch closely");
      expect(result.data.direction).toBe("below");
      expect(result.data.channel).toBe("notification");
    }
  });

  it("validation handles minimal valid payload", () => {
    const result = validateNewAlert({
      symbol: "aapl",
      direction: "above",
      threshold: 100,
      channel: "notification",
      target: "token",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.symbol).toBe("AAPL");
    }
  });

  it("rejects invalid creation payloads", () => {
    // Missing required fields or invalid types
    const result = validateNewAlert({ symbol: "", threshold: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("symbol is required");
      expect(result.errors).toContain("threshold must be a positive number");
      expect(result.errors).toContain("direction must be 'above' or 'below'");
      expect(result.errors).toContain("channel must be 'notification'");
      expect(result.errors).toContain("target is required");
    }
  });

  it("rejects invalid enum values for creation", () => {
    const result = validateNewAlert({
      symbol: "AAPL",
      direction: "sideways",
      threshold: 100,
      channel: "sms",
      target: "token",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("direction must be 'above' or 'below'");
      expect(result.errors).toContain("channel must be 'notification'");
    }
  });

  it("validates updates", () => {
    const result = validateAlertUpdate({ threshold: 210, status: "paused" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.threshold).toBe(210);
      expect(result.data.status).toBe("paused");
    }
  });

  it("validates full update success", () => {
    const result = validateAlertUpdate({
      symbol: "GOOGL",
      direction: "above",
      channel: "notification",
      target: "newToken",
      threshold: 1500
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.symbol).toBe("GOOGL");
      expect(result.data.direction).toBe("above");
      expect(result.data.channel).toBe("notification");
      expect(result.data.target).toBe("newToken");
      expect(result.data.threshold).toBe(1500);
    }
  });

  it("validates partial updates", () => {
    const result = validateAlertUpdate({ notes: "new note" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.notes).toBe("new note");
    }
  });

  it("validates clearing notes", () => {
    const result = validateAlertUpdate({ notes: "" }); // Empty string should clear
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.notes).toBeNull();
    }

    const result2 = validateAlertUpdate({ notes: null }); // null should clear
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.data.notes).toBeNull();
    }
  });

  it("rejects invalid update values", () => {
    const result = validateAlertUpdate({
      direction: "wrong",
      channel: "wrong",
      status: "wrong",
      threshold: -10,
      target: "", // empty target
      notes: 123 // invalid type
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("direction must be 'above' or 'below'");
      expect(result.errors).toContain("channel must be 'notification'");
      expect(result.errors).toContain("status must be 'active' or 'paused'");
      expect(result.errors).toContain("threshold must be a positive number");
      expect(result.errors).toContain("target is required");
      expect(result.errors).toContain("notes must be a string");
    }
  });

  it("requires at least one field on update", () => {
    const result = validateAlertUpdate({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("at least one field must be provided");
    }
  });
});
