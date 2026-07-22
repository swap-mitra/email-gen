#!/usr/bin/env node
// Applies every hand-written CREATE INDEX statement checked into drizzle/*.sql.
//
// Why this exists: `drizzle-kit push` (this repo's schema-sync command) diffs
// schema.ts directly against the database — it never executes the .sql
// migration files, so any index that isn't declared via index() in
// schema.ts (all of them, by this repo's convention, since some are
// expression indexes push can't represent — e.g. the pgvector HNSW index)
// is silently never created. Run this once after every `db:push`, including
// against a brand-new production database.
//
// Safe to re-run: every statement is CREATE INDEX IF NOT EXISTS.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  for (const file of [".env.local", ".env"]) {
    let contents;
    try {
      contents = readFileSync(path.join(rootDir, file), "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^DATABASE_URL=(.*)$/);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  throw new Error(
    "DATABASE_URL is not set and was not found in .env.local or .env.",
  );
}

function collectIndexStatements() {
  const drizzleDir = path.join(rootDir, "drizzle");
  const files = readdirSync(drizzleDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const statements = [];
  for (const file of files) {
    const raw = readFileSync(path.join(drizzleDir, file), "utf8");
    const withoutBreakpoints = raw.split("--> statement-breakpoint").join("\n");
    const withoutComments = withoutBreakpoints
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    for (const chunk of withoutComments.split(";")) {
      const trimmed = chunk.trim();
      if (/^CREATE\s+(UNIQUE\s+)?INDEX\s+IF NOT EXISTS/i.test(trimmed)) {
        statements.push({ file, sql: `${trimmed};` });
      }
    }
  }
  return statements;
}

async function main() {
  const databaseUrl = loadDatabaseUrl();
  const statements = collectIndexStatements();

  if (statements.length === 0) {
    console.log("No CREATE INDEX statements found under drizzle/.");
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    for (const { file, sql: statement } of statements) {
      await sql.unsafe(statement);
      console.log(`applied (${file}): ${statement.split("\n")[0].slice(0, 100)}`);
    }
  } finally {
    await sql.end();
  }

  console.log(`Done — ${statements.length} index statement(s) applied.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
