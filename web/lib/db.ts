import { Pool } from "pg";

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

// Get connection string and ensure it's a string
const connectionString = process.env.DATABASE_URL || process.env.PG_DSN;

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: connectionString ? String(connectionString) : undefined,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

const SUPPRESSED_DB_ERROR_PATTERNS = [
  "sasl: scram-server-first-message: client password must be a string",
];

export function shouldSilenceDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return SUPPRESSED_DB_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function logDbError(context: string, error: unknown): void {
  if (shouldSilenceDbError(error)) {
    return;
  }
  console.error(context, error);
}
