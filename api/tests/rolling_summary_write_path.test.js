import { describe, it, expect, vi } from 'vitest';

import { maybeUpdateRollingSummary } from '../services/llm/rolling_summary.js';

describe('P0 rolling summary write-path updater', () => {
  it('skips when ROLLING_SUMMARY_ENABLED is off', async () => {
    const previous = process.env.ROLLING_SUMMARY_ENABLED;
    process.env.ROLLING_SUMMARY_ENABLED = '0';

    const res = await maybeUpdateRollingSummary({
      pool: { connect: async () => { throw new Error('should not connect'); } },
      nodeId: 'node-1',
      userId: 'user-1',
    });

    if (typeof previous === 'undefined') {
      delete process.env.ROLLING_SUMMARY_ENABLED;
    } else {
      process.env.ROLLING_SUMMARY_ENABLED = previous;
    }

    expect(res).toMatchObject({ skipped: true, reason: 'disabled' });
  });

  it('returns locked when advisory lock cannot be acquired', async () => {
    const previous = process.env.ROLLING_SUMMARY_ENABLED;
    process.env.ROLLING_SUMMARY_ENABLED = 'true';

    const queries = [];
    const client = {
      query: vi.fn(async (sql) => {
        queries.push(String(sql));
        if (String(sql).includes('pg_try_advisory_lock')) {
          return { rows: [{ locked: false }] };
        }
        throw new Error('unexpected query');
      }),
      release: vi.fn(),
    };

    const pool = { connect: async () => client };
    const res = await maybeUpdateRollingSummary({ pool, nodeId: 'node-1', userId: 'user-1' });

    if (typeof previous === 'undefined') {
      delete process.env.ROLLING_SUMMARY_ENABLED;
    } else {
      process.env.ROLLING_SUMMARY_ENABLED = previous;
    }

    expect(res).toMatchObject({ skipped: true, reason: 'locked' });
    expect(queries.some((q) => q.includes('pg_try_advisory_lock'))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('unlocks (best-effort) on failure after acquiring lock', async () => {
    const previous = process.env.ROLLING_SUMMARY_ENABLED;
    process.env.ROLLING_SUMMARY_ENABLED = 'true';

    const queries = [];
    const client = {
      query: vi.fn(async (sql) => {
        const q = String(sql);
        queries.push(q);
        if (q.includes('pg_try_advisory_lock')) {
          return { rows: [{ locked: true }] };
        }
        if (q.includes('SELECT rolling_summary')) {
          throw new Error('DB_FAIL');
        }
        if (q.includes('pg_advisory_unlock')) {
          return { rows: [{ unlocked: true }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const pool = { connect: async () => client };
    const res = await maybeUpdateRollingSummary({ pool, nodeId: 'node-1', userId: 'user-1' });

    if (typeof previous === 'undefined') {
      delete process.env.ROLLING_SUMMARY_ENABLED;
    } else {
      process.env.ROLLING_SUMMARY_ENABLED = previous;
    }

    expect(res).toMatchObject({ skipped: true, reason: 'error' });
    expect(queries.some((q) => q.includes('pg_try_advisory_lock'))).toBe(true);
    expect(queries.some((q) => q.includes('pg_advisory_unlock'))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

