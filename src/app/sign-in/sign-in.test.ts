import { describe, expect, it } from "vitest";
import { callbackTarget } from "./callback-target";

describe("callbackTarget", () => {
  it("returns the dashboard when there is no next param", () => {
    expect(callbackTarget("")).toBe("/dashboard");
    expect(callbackTarget("?other=1")).toBe("/dashboard");
  });

  it("honours a same-origin relative path", () => {
    expect(callbackTarget("?next=%2Faccept-invitation%2Fabc123")).toBe(
      "/accept-invitation/abc123",
    );
    expect(callbackTarget("?next=%2Fdashboard%2Fdrafts%3Ffilter%3Dnew")).toBe(
      "/dashboard/drafts?filter=new",
    );
  });

  it("rejects anything that could leave the origin", () => {
    for (const hostile of [
      "https://evil.test/phish",
      "//evil.test/phish",
      "/\\evil.test/phish",
      "javascript:alert(1)",
      "dashboard",
    ]) {
      expect(callbackTarget(`?next=${encodeURIComponent(hostile)}`)).toBe("/dashboard");
    }
  });
});
