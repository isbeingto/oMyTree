/**
 * Shared PostgreSQL connection pool configuration
 * 
 * This module provides a centralized database connection pool that reads
 * configuration from environment variables. All services should import
 * the pool from this module instead of creating their own.
 * 
 * Environment Variables (from ecosystem.config.js):
 * - PG_DSN or DATABASE_URL: Full connection string (takes precedence)
 * - PGHOST: Database host (default: 127.0.0.1)
 * - PGPORT: Database port (default: 5432)
 * - PGUSER: Database user (default: omytree)
 * - PGPASSWORD: Database password (required in production)
 * - PGDATABASE: Database name (default: omytree)
 */

import { Pool, Client } from 'pg';

function parsePositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[db/pool] Invalid ${name}=${raw}, fallback to ${fallback}`);
    return fallback;
  }
  return value;
}

// Connection configuration from environment variables
const connectionConfig = process.env.PG_DSN || process.env.DATABASE_URL
  ? { connectionString: process.env.PG_DSN || process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER || 'omytree',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'omytree',
    };

// Validate that password is provided when not using connection string
if (!connectionConfig.connectionString && !connectionConfig.password) {
  console.warn('[db/pool] Warning: PGPASSWORD not set. Database connections may fail.');
}

// Pool configuration with reasonable timeouts to prevent idle-in-transaction issues
const poolMax = parsePositiveIntEnv('PGPOOL_MAX', 20);
const poolIdleTimeoutMs = parsePositiveIntEnv('PGPOOL_IDLE_TIMEOUT_MS', 30000);
const poolConnectionTimeoutMs = parsePositiveIntEnv('PGPOOL_CONNECTION_TIMEOUT_MS', 10000);

const poolConfig = {
  ...connectionConfig,
  // Maximum number of clients in the pool
  max: poolMax,
  // Idle timeout: release connections after 30 seconds of inactivity
  idleTimeoutMillis: poolIdleTimeoutMs,
  // Connection timeout: fail fast if we can't get a connection in 10 seconds
  connectionTimeoutMillis: poolConnectionTimeoutMs,
};

// Shared connection pool for most services
export const pool = new Pool(poolConfig);

// Handle connection pool errors gracefully
pool.on('error', (err) => {
  console.error('[db/pool] Unexpected error on idle client in pool:', {
    message: err.message,
    code: err.code,
    severity: err.severity,
  });
  // Pool will automatically try to reconnect
});

/**
 * Get a client from the pool with error handling attached.
 * This prevents "unhandled error" crashes when the server terminates 
 * idle-in-transaction connections.
 * 
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     // ... your queries
 *     await client.query('COMMIT');
 *   } catch (err) {
 *     await client.query('ROLLBACK').catch(() => {});
 *     throw err;
 *   } finally {
 *     client.release();
 *   }
 * 
 * @returns {Promise<PoolClient>} A client from the pool with error handling
 */
export async function getClient() {
  const client = await pool.connect();
  
  // Attach error handler to prevent crashes from server-side connection termination
  // This happens when idle_in_transaction_session_timeout is exceeded
  const errorHandler = (err) => {
    console.error('[db/pool] Connection error on checked-out client:', {
      message: err.message,
      code: err.code,
      severity: err.severity,
    });
    // Mark the client as broken so it won't be reused
    client._connectionError = err;
  };
  
  client.on('error', errorHandler);
  
  // Override release to remove the error handler
  const originalRelease = client.release.bind(client);
  client.release = (err) => {
    client.removeListener('error', errorHandler);
    return originalRelease(err);
  };
  
  return client;
}

// Resilient pool query that auto-recovers from connection errors
export async function resilientQuery(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    // If it's a connection error, log and rethrow for caller to handle
    if (err.code === '25P03' || err.code === '57P01' || err.code === '08006') {
      console.warn('[db/pool] Connection error during query, pool will auto-recover:', err.code);
    }
    throw err;
  }
}

// Only log connection events in debug mode to reduce noise
const DEBUG_DB = process.env.DEBUG_DB === 'true';
if (DEBUG_DB) {
  pool.on('connect', () => {
    console.log('[db/pool] New client connected to database pool');
  });
}

// Create a new client (for services that need a dedicated connection)
export function createClient() {
  const client = new Client(connectionConfig);

  // If the server terminates a connection (e.g. idle_in_transaction_session_timeout),
  // pg will emit an 'error' event. Without a listener, Node.js will crash.
  client.on('error', (err) => {
    console.error('[db/pool] Unexpected error on pg Client:', {
      message: err.message,
      code: err.code,
      severity: err.severity,
    });
  });

  return client;
}

// Export connection config for debugging (without password)
export function getConnectionInfo() {
  if (connectionConfig.connectionString) {
    const url = new URL(connectionConfig.connectionString);
    return {
      type: 'dsn',
      host: url.hostname,
      port: url.port,
      database: url.pathname.slice(1),
    };
  }
  return {
    type: 'individual',
    host: connectionConfig.host,
    port: connectionConfig.port,
    database: connectionConfig.database,
  };
}

export default pool;
