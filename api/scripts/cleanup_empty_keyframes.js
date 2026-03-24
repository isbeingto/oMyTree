#!/usr/bin/env node
/**
 * B3 任务：一次性清理所有无批注的 keyframes
 * 执行方式：node api/scripts/cleanup_empty_keyframes.js
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

async function cleanup() {
  const client = await pool.connect();
  try {
    console.log('[B3] 开始清理空批注 keyframes...');
    
    // 1. 查看清理前数量
    const beforeResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM keyframes 
      WHERE annotation IS NULL OR annotation = '[]' OR annotation = ''
    `);
    const beforeCount = parseInt(beforeResult.rows[0].count);
    console.log(`[B3] 清理前空批注 keyframes: ${beforeCount} 条`);
    
    if (beforeCount === 0) {
      console.log('[B3] 无需清理，退出。');
      return;
    }
    
    // 2. 执行删除
    const deleteResult = await client.query(`
      DELETE FROM keyframes 
      WHERE annotation IS NULL OR annotation = '[]' OR annotation = ''
    `);
    console.log(`[B3] 已删除: ${deleteResult.rowCount} 条`);
    
    // 3. 验证清理后数量
    const afterResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM keyframes 
      WHERE annotation IS NULL OR annotation = '[]' OR annotation = ''
    `);
    const afterCount = parseInt(afterResult.rows[0].count);
    console.log(`[B3] 清理后空批注 keyframes: ${afterCount} 条`);
    
    // 4. 显示当前总数
    const totalResult = await client.query('SELECT COUNT(*) as count FROM keyframes');
    const totalCount = parseInt(totalResult.rows[0].count);
    console.log(`[B3] 当前总 keyframes: ${totalCount} 条`);
    
    // 5. 验证结果
    if (afterCount === 0 && deleteResult.rowCount === beforeCount) {
      console.log('[B3] ✅ 清理成功！');
    } else {
      console.error('[B3] ⚠️ 清理结果异常，请检查数据库。');
    }
    
  } catch (error) {
    console.error('[B3] ❌ 清理失败:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanup().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
