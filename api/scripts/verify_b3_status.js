#!/usr/bin/env node
/**
 * B3 验证脚本：检查空批注 keyframes 的清理状态
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'omytree'
});

async function verify() {
  const client = await pool.connect();
  try {
    const total = await client.query('SELECT COUNT(*) FROM keyframes');
    const empty = await client.query(`
      SELECT COUNT(*) FROM keyframes 
      WHERE annotation IS NULL OR annotation = '[]' OR annotation = ''
    `);
    const withAnnotation = await client.query(`
      SELECT COUNT(*) FROM keyframes 
      WHERE annotation IS NOT NULL AND annotation != '' AND annotation != '[]'
    `);

    console.log('=== B3 验证报告 ===');
    console.log(`总 keyframes: ${total.rows[0].count}`);
    console.log(`空批注 keyframes: ${empty.rows[0].count}`);
    console.log(`有效批注 keyframes: ${withAnnotation.rows[0].count}`);
    console.log('状态:', empty.rows[0].count === '0' ? '✅ 清理成功' : '⚠️ 仍有空批注');
    
  } finally {
    client.release();
    await pool.end();
  }
}

verify().catch(err => {
  console.error('验证失败:', err);
  process.exit(1);
});
