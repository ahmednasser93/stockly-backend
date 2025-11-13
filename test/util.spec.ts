import { describe, it, expect } from "vitest";
import { json } from "../src/util";

describe("json utility", () => {
  it("serializes payload into a JSON Response", async () => {
    const payload = { name: "Stockly", active: true };
    const response = json(payload);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    await expect(response.json()).resolves.toEqual(payload);
  });

  it("allows overriding the status code", async () => {
    const response = json({ message: "nope" }, 418);

    expect(response.status).toBe(418);
    await expect(response.json()).resolves.toEqual({ message: "nope" });
  });
});
