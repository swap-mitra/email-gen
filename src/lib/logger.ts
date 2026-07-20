// ---------------------------------------------------------------------------
// Structured JSON logger — one line per event, safe for log-aggregator
// ingestion (Vercel/Railway/etc capture stdout/stderr and index JSON fields).
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

class Logger {
  constructor(private readonly bindings: LogContext = {}) {}

  /** Returns a new logger with additional fields attached to every entry. */
  child(bindings: LogContext): Logger {
    return new Logger({ ...this.bindings, ...bindings });
  }

  private write(level: LogLevel, msg: string, context?: LogContext) {
    if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...this.bindings,
      ...context,
    };
    const line = JSON.stringify(entry);

    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  debug(msg: string, context?: LogContext) {
    this.write("debug", msg, context);
  }

  info(msg: string, context?: LogContext) {
    this.write("info", msg, context);
  }

  warn(msg: string, context?: LogContext) {
    this.write("warn", msg, context);
  }

  /** `error` in context is serialized (name/message/stack) instead of logged raw. */
  error(msg: string, context?: LogContext & { error?: unknown }) {
    const { error, ...rest } = context ?? {};
    this.write("error", msg, {
      ...rest,
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    });
  }
}

export const logger = new Logger();
