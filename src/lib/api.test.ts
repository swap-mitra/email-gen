import { describe, expect, it } from "vitest";
import { parseLimit } from "@/lib/api";

const bounds = { fallback: 50, max: 100 };
const limitFor = (query: string) => parseLimit(new URLSearchParams(query), bounds);

describe("parseLimit", () => {
  it("falls back when the parameter is absent, empty, or not a number", () => {
    expect(limitFor("")).toBe(50);
    expect(limitFor("limit=")).toBe(50); // Number("") is 0 — used to clamp to 1
    expect(limitFor("limit=%20")).toBe(50);
    expect(limitFor("limit=abc")).toBe(50);
  });

  it("clamps to the allowed range", () => {
    expect(limitFor("limit=0")).toBe(1);
    expect(limitFor("limit=-5")).toBe(1);
    expect(limitFor("limit=1000")).toBe(100);
    expect(limitFor("limit=25")).toBe(25);
  });

  it("floors fractional values", () => {
    expect(limitFor("limit=7.9")).toBe(7);
  });
});
