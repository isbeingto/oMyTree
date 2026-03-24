import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 自动为测试加载环境变量
    env: {
      PGUSER: 'omytree',
      PGPASSWORD: 'test_password',
      PGHOST: '127.0.0.1',
      PGPORT: '5432',
      PGDATABASE: 'omytree',
      PGSSLMODE: 'disable',
      TREE_ADAPTER: 'pg',
    },
    // 测试超时时间 - 增加以适应数据库操作
    testTimeout: 60000,
    hookTimeout: 30000,
    // 测试报告
    reporters: ['verbose'],
    // 顺序运行避免数据库竞争
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
