import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { findNearestAncestorOutcomeIdForPath } from '../../lib/outcome/ancestor_outcome.js';
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
    ['ancestor-outcome-test', userId]
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
     RETURNING id`,
    [userId, treeId, anchorNodeId, title, conclusion]
  );
  return res.rows[0].id;
}

async function cleanupTree(treeId) {
  await pool.query(`DELETE FROM outcomes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
}

describe('T93-15 nearest ancestor outcome lookup', () => {
  let userId;
  let treeId;
  let rootId;
  let aId;
  let bId;
  let cId;
  let outcomeA;
  let outcomeB;

  beforeEach(async () => {
    userId = await createUser();
    const setup = await createTreeWithRoot(userId);
    treeId = setup.treeId;
    rootId = setup.rootId;

    aId = await createChildNode({ treeId, parentId: rootId, level: 1, text: 'A' });
    bId = await createChildNode({ treeId, parentId: aId, level: 2, text: 'B' });
    cId = await createChildNode({ treeId, parentId: bId, level: 3, text: 'C' });

    outcomeA = await createOutcome({ userId, treeId, anchorNodeId: aId, title: 'OA', conclusion: 'CA' });
    outcomeB = await createOutcome({ userId, treeId, anchorNodeId: bId, title: 'OB', conclusion: 'CB' });
  });

  afterEach(async () => {
    if (treeId) {
      await cleanupTree(treeId);
    }
    if (userId) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('returns closest ancestor outcome for anchor', async () => {
    const mainPath = [rootId, aId, bId, cId];

    const derived = await findNearestAncestorOutcomeIdForPath({
      userId,
      treeId,
      anchorNodeId: cId,
      mainPathNodeIds: mainPath,
      options: { client: pool },
    });

    expect(derived).toBe(outcomeB);
  });

  it('excludes anchor node itself (chooses ancestor before anchor)', async () => {
    const mainPath = [rootId, aId, bId];

    const derived = await findNearestAncestorOutcomeIdForPath({
      userId,
      treeId,
      anchorNodeId: bId,
      mainPathNodeIds: mainPath,
      options: { client: pool },
    });

    expect(derived).toBe(outcomeA);
  });

  it('returns null when no ancestor outcome exists', async () => {
    const mainPath = [rootId, aId];

    // Delete A outcome to ensure none exist.
    await pool.query(`DELETE FROM outcomes WHERE id = $1`, [outcomeA]);
    await pool.query(`DELETE FROM outcomes WHERE id = $1`, [outcomeB]);

    const derived = await findNearestAncestorOutcomeIdForPath({
      userId,
      treeId,
      anchorNodeId: aId,
      mainPathNodeIds: mainPath,
      options: { client: pool },
    });

    expect(derived).toBe(null);
  });

  it('T93-16 delta report: only generates nodes after ancestor', async () => {
    const mainPath = [rootId, aId, bId, cId];

    // Create a new outcome at C derived from outcomeB (anchored at B)
    const outcomeCId = await createOutcome({
      userId,
      treeId,
      anchorNodeId: cId,
      title: 'OC',
      conclusion: 'CC',
    });

    // Attach derived relation
    await pool.query(
      `UPDATE outcomes SET derived_from_outcome_id = $1 WHERE id = $2`,
      [outcomeB, outcomeCId]
    );

    const outcomeC = (await pool.query(`SELECT * FROM outcomes WHERE id = $1`, [outcomeCId])).rows[0];

    // Provide keyframes at B and C; B should be filtered out by delta.
    const fakeKeyframes = [
      { keyframeId: '00000000-0000-0000-0000-00000000000b', nodeId: bId, turnId: null, annotation: 'KF-B' },
      { keyframeId: '00000000-0000-0000-0000-00000000000c', nodeId: cId, turnId: null, annotation: 'KF-C' },
    ];

    const report = await generateReport({
      outcome: outcomeC,
      mainPathNodeIds: mainPath,
      keyframes: fakeKeyframes,
      options: { client: pool },
    });

    // Ancestor at B -> delta start is after B, so only C remains.
    expect(report.delta_start_index).toBe(3);
    expect(report.delta_start_node_id).toBe(cId);
    expect(report.expanded_node_ids).toEqual([cId]);
    expect(report.skeleton_keyframe_ids).toEqual(['00000000-0000-0000-0000-00000000000c']);

    // Ensure ancestor_summary exists and is sourced by outcome id
    const ancestorSection = report.sections.find((s) => s.type === 'ancestor_summary');
    expect(ancestorSection).toBeTruthy();
    expect(ancestorSection.sources).toEqual([`outcome:${outcomeB}`]);
  });
});
