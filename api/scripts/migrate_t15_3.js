import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_FILE = path.join(__dirname, '../db/migrations/20251121_add_users_table.sql');

function resolvePoolConfig() {
  const dsn = process.env.PG_DSN || process.env.DATABASE_URL;
  
  const base = {
    host: process.env.PGHOST || "127.0.0.1",
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || "linzhi",
    password: process.env.PGPASSWORD || "",
    database: process.env.PGDATABASE || "linzhi",
  };

  if (dsn) {
    return { connectionString: dsn };
  }
  return base;
}

async function runMigration() {
  const config = resolvePoolConfig();
  console.log(`Connecting to database: ${config.connectionString || config.database}...`);
  
  const pool = new Pool(config);
  
  try {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    console.log(`Running migration from ${MIGRATION_FILE}...`);
    
    await pool.query(sql);
    
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
