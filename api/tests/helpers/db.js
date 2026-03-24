/**
 * Test database pool configuration
 * 
 * This module provides database connection for tests.
 * Uses the same configuration as the main pool.js but with
 * fallback for local development without full ecosystem.config.js
 */

import { Pool } from 'pg';

// Test-specific pool that always has a fallback for local dev
export const testPool = new Pool(
  process.env.PG_DSN || process.env.DATABASE_URL
    ? { connectionString: process.env.PG_DSN || process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || 'omytree',
        password: process.env.PGPASSWORD || process.env.TEST_PGPASSWORD,
        database: process.env.PGDATABASE || 'omytree',
      }
);

export default testPool;
