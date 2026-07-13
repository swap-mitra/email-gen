import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

declare global {
  var __emailGenSql: postgres.Sql | undefined;
}

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to access the application database.");
  }

  const client =
    globalThis.__emailGenSql ??
    postgres(process.env.DATABASE_URL, {
      max: 1,
      prepare: false,
    });

  if (!globalThis.__emailGenSql) {
    globalThis.__emailGenSql = client;
  }

  return drizzle(client, { schema });
}
