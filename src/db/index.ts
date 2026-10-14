import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const globalForDb = globalThis as unknown as { __egPool?: Pool; __egDb?: DB };

function createDb(): DB {
  const pool =
    globalForDb.__egPool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      // Set DATABASE_SSL=no-verify if your provider's certificate chain isn't trusted by Node.
      ssl: process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined,
    });
  globalForDb.__egPool = pool;
  return drizzle(pool, { schema });
}

export const db: DB = globalForDb.__egDb ?? (globalForDb.__egDb = createDb());
export { schema };
