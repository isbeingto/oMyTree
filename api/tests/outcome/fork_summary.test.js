import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { getForkPointsOnPath } from '../../lib/outcome/path_builder.js';
import { generateReport } from '../../lib/outcome/report_generator.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

async function createUser() {
  const email = `test+${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['Test User', email]
  );
  return res.rows[0].id;
}

async function createTreeWithRoot(userId) {
  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id)
     VALUES ($1, 'user', 'active', $2)
     RETURNING id`,
    ['fork-summary-test', userId]
  );
  const treeId = treeRes.rows[0].id;

  const rootRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, NULL, 0, 'user', 'root')
     RETURNING id`,
    [treeId]
  );

  return { treeId, rootId: rootRes.rows[0].id };
}

async function createChildNode({ treeId, parentId, level, text }) {
  const res = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, $2, $3, 'user', $4)
     RETURNING id`,
    [treeId, parentId, level, text]
  );
  return res.rows[0].id;
}

async function createOutcome({ userId, treeId, anchorNodeId, title, conclusion }) {
  const res = await pool.query(
    `INSERT INTO outcomes (user_id, tree_id, anchor_node_id, title, conclusion, status)
     VALUES ($1, $2, $3, $4, $5, 'generated')
     RETURNING *`,
    [userId, treeId, anchorNodeId, title, conclusion]
  );
  return res.rows[0];
}

async function cleanupTree(treeId) {
  await pool.query(`DELETE FROM outcomes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
}

describe('T93-18 fork points + fork_summary section', () => {
  let userId;
  let treeId;
  let rootId;
  let aId;
  let bId;
  let cId;

  beforeEach(async () => {
    userId = await createUser();
    const setup = await createTreeWithRoot(userId);
    treeId = setup.treeId;
    rootId = setup.rootId;

    aId = await createChildNode({ treeId, parentId: rootId, level: 1, text: 'A' });
    bId = await createChildNode({ treeId, parentId: aId, level: 2, text: 'B' });
    cId = await createChildNode({ treeId, parentId: bId, level: 3, text: 'C' });

    // Create a side branch under A so A becomes a fork point.
    await createChildNode({ treeId, parentId: aId, level: 2, text: 'A-side' });
  });

  afterEach(async () => {
    if (treeId) {
      await cleanupTree(treeId);
    }
    if (userId) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('detects fork points on main path', async () => {
    const mainPath = [rootId, aId, bId, cId];
    const forks = await getForkPointsOnPath(treeId, mainPath, { client: pool });

    expect(Array.isArray(forks)).toBe(true);
    expect(forks.length).toBe(1);
    expect(forks[0].nodeId).toBe(aId);
    expect(forks[0].childCount).toBe(2);
  });

  it('injects fork_summary section with sources and fills report_json.fork_points', async () => {
    const mainPath = [rootId, aId, bId, cId];
    const outcome = await createOutcome({
      userId,
      treeId,
      anchorNodeId: cId,
      title: 'OC',
      conclusion: 'CC',
    });

    const fakeKeyframes = [
      { keyframeId: '00000000-0000-0000-0000-00000000000c', nodeId: cId, turnId: null, annotation: 'KF-C' },
    ];

    const report = await generateReport({
      outcome,
      mainPathNodeIds: mainPath,
      keyframes: fakeKeyframes,
      options: { client: pool },
    });

    expect(Array.isArray(report.fork_points)).toBe(true);
    expect(report.fork_points.length).toBe(1);
    expect(report.fork_points[0].node_id).toBe(aId);
    expect(report.fork_points[0].child_count).toBe(2);

    const forkSection = report.sections.find((s) => s.type === 'fork_summary');
    expect(forkSection).toBeTruthy();
    expect(Array.isArray(forkSection.sources)).toBe(true);
    expect(forkSection.sources).toContain(`node:${aId}`);
  });
});
