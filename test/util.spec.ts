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

describe("CORS headers", () => {
  it("returns wildcard for unknown origin", () => {
    const response = json({ ok: true });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns specific origin for allowed domain", () => {
    const request = new Request("https://api.stockly.com", {
      headers: { "Origin": "https://stockly-webapp.pages.dev" }
    });
    const response = json({ ok: true }, 200, request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://stockly-webapp.pages.dev");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("allows localhost", () => {
    const request = new Request("http://localhost:8787", {
      headers: { "Origin": "http://localhost:3000" }
    });
    const response = json({ ok: true }, 200, request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("allows localhost with random port", () => {
    const request = new Request("http://localhost:8787", {
      headers: { "Origin": "http://localhost:9999" }
    });
    const response = json({ ok: true }, 200, request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:9999");
  });

  it("falls back to * if origin not allowed", () => {
    const request = new Request("https://api.stockly.com", {
      headers: { "Origin": "https://evil.com" }
    });
    const response = json({ ok: true }, 200, request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });
});
