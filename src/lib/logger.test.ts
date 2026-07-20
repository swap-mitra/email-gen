import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes info logs as a single JSON line with ts/level/msg", () => {
    logger.info("something_happened", { foo: "bar" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ level: "info", msg: "something_happened", foo: "bar" });
    expect(typeof entry.ts).toBe("string");
  });

  it("routes warn and error to console.warn/console.error respectively", () => {
    logger.warn("degraded");
    logger.error("broke");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("serializes Error instances passed as `error` into name/message/stack", () => {
    logger.error("db_write_failed", { error: new Error("connection reset") });

    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.error).toMatchObject({ name: "Error", message: "connection reset" });
    expect(typeof entry.error.stack).toBe("string");
  });

  it("child() binds fields onto every subsequent log entry", () => {
    const child = logger.child({ requestId: "req-1", workspaceId: "ws-1" });
    child.info("scoped_event");

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ requestId: "req-1", workspaceId: "ws-1", msg: "scoped_event" });
  });
});
