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
    }
  });

  it("rejects invalid creation payloads", () => {
    const result = validateNewAlert({ symbol: "", threshold: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("symbol is required");
      expect(result.errors).toContain("threshold must be a positive number");
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

  it("requires at least one field on update", () => {
    const result = validateAlertUpdate({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("at least one field must be provided");
    }
  });
});
