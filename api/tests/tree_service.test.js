import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

// Import the actual repo function to test its coverage
import { getRootNodeByTreeId } from '../services/tree/repo.js';

// Use the same pool config as turn_create tests
const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

// Inline implementations that use our test pool instead of module pools
// This allows us to test the logic without connection issues

async function testCreateTreeWithRoot({
  topic_text,
  created_by = 'system',
  dedupe = false,
  user_id = null,
}) {
  if (typeof topic_text !== 'string' || topic_text.trim().length < 1 || topic_text.length > 256) {
    const e = new Error('INVALID_TOPIC');
    e.status = 422;
    throw e;
  }
  if (!user_id || typeof user_id !== 'string') {
    const e = new Error('MISSING_USER_ID');
    e.status = 422;
    throw e;
  }
  const topic = topic_text.trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (dedupe) {
      const { rows: ex } = await client.query(
        'SELECT id FROM trees WHERE topic=$1 AND created_by=$2 AND user_id = $3 LIMIT 1',
        [topic, created_by, user_id]
      );
      if (ex[0]) {
        const e = new Error('TREE_EXISTS');
        e.status = 409;
        throw e;
      }
    }

    const { rows: trows } = await client.query(
      `INSERT INTO trees(topic, created_by, status, user_id)
       VALUES ($1,$2,'active',$3)
       RETURNING id, topic, created_by, status, created_at, user_id`,
      [topic, created_by, user_id]
    );
    const tree = trows[0];

    const { rows: nrows } = await client.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, NULL, 0, 'system', $2)
       RETURNING id, tree_id, parent_id, level, role, text, created_at`,
      [tree.id, topic]
    );
    const root = nrows[0];

    await client.query(
      `INSERT INTO events(event_type, tree_id, payload)
       VALUES ('tree.created', $1, jsonb_build_object('topic', $2::text, 'created_by', $3::text))`,
      [tree.id, topic, created_by]
    );
    await client.query(
      `INSERT INTO events(event_type, tree_id, node_id, payload)
       VALUES ('node.created', $1, $2, jsonb_build_object('role', 'system'::text, 'level', 0::integer))`,
      [tree.id, root.id]
    );

    await client.query('COMMIT');
    return { tree, root };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function testGetRootNodeByTreeId(treeId) {
  const { rows } = await pool.query(
    `SELECT n.id, n.tree_id, n.parent_id, n.level, n.role, n.text, n.created_at
     FROM nodes n WHERE n.tree_id=$1 AND n.parent_id IS NULL AND n.level=0
     LIMIT 1`, [treeId]
  );
  return rows[0] || null;
}

async function testForkTreeFromNode({ node_id, created_by = 'system', dedupe = false, user_id = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Read source node (filter soft-deleted)
    const { rows: srcRows } = await client.query(
      `SELECT n.id, n.text, n.tree_id
       FROM nodes n
       WHERE n.id = $1 AND n.soft_deleted_at IS NULL
       LIMIT 1`, [node_id]
    );
    const src = srcRows[0];
    if (!src) {
      const e = new Error('NODE_NOT_FOUND');
      e.status = 404;
      throw e;
    }
    const topic = (src.text || '').trim();
    if (!topic) {
      const e = new Error('EMPTY_TOPIC');
      e.status = 422;
      throw e;
    }

    // 2) Dedupe check
    if (dedupe) {
      const { rows: ex } = await client.query(
        `SELECT id FROM trees WHERE topic=$1 AND created_by=$2 LIMIT 1`,
        [topic, created_by]
      );
      if (ex[0]) {
        const e = new Error('TREE_EXISTS');
        e.status = 409;
        throw e;
      }
    }

    // 3) Create new tree + root node
    const { rows: trows } = await client.query(
      `INSERT INTO trees(topic, created_by, status, user_id)
       VALUES ($1,$2,'active',$3)
       RETURNING id, topic, created_by, status, created_at`,
      [topic, created_by, user_id]
    );
    const tree = trows[0];

    const { rows: nrows } = await client.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, NULL, 0, 'system', $2)
       RETURNING id, tree_id, parent_id, level, role, text, created_at`,
      [tree.id, topic]
    );
    const root = nrows[0];

    // 4) Events
    await client.query(
      `INSERT INTO events(event_type, tree_id, payload)
       VALUES ('tree.forked', $1,
         jsonb_build_object(
           'new_tree_id', $1::uuid,
           'source_tree_id', $2::uuid,
           'anchor_node_id', $3::uuid,
           'source_node_id', $3::uuid,
           'topic', $4::text,
           'created_by', $5::text
         )
       )`,
      [tree.id, src.tree_id, src.id, topic, created_by]
    );
    await client.query(
      `INSERT INTO events(event_type, tree_id, node_id, payload)
       VALUES ('node.created', $1, $2, jsonb_build_object('role', 'system'::text, 'level', 0::integer))`,
      [tree.id, root.id]
    );

    await client.query('COMMIT');
    return { tree, root };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Helper: create test user with unique email
let emailCounter = 0;
async function createTestUser() {
  emailCounter++;
  const email = `tree-test+${Date.now()}-${emailCounter}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['Tree Test User', email],
  );
  return res.rows[0].id;
}

// Helper: cleanup tree and related data
async function cleanupTree(treeId) {
  if (!treeId) return;
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
}

// Helper: cleanup user
async function cleanupUser(userId) {
  if (!userId) return;
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

describe('testCreateTreeWithRoot', () => {
  let userId;
  let createdTreeIds = [];

  beforeEach(async () => {
    userId = await createTestUser();
    createdTreeIds = [];
  });

  afterEach(async () => {
    for (const treeId of createdTreeIds) {
      await cleanupTree(treeId);
    }
    await cleanupUser(userId);
  });

  it('creates a tree with root node (happy path)', async () => {
    const { tree, root } = await testCreateTreeWithRoot({
      topic_text: 'Test Tree Topic',
      created_by: 'user',
      user_id: userId,
    });
    createdTreeIds.push(tree.id);

    expect(tree).toBeTruthy();
    expect(tree.id).toBeTruthy();
    expect(tree.topic).toBe('Test Tree Topic');
    expect(tree.created_by).toBe('user');
    expect(tree.status).toBe('active');
    expect(tree.user_id).toBe(userId);
    expect(tree.created_at).toBeTruthy();

    expect(root).toBeTruthy();
    expect(root.id).toBeTruthy();
    expect(root.tree_id).toBe(tree.id);
    expect(root.parent_id).toBeNull();
    expect(root.level).toBe(0);
    expect(root.role).toBe('system');
    expect(root.text).toBe('Test Tree Topic');
  });

  it('trims whitespace from topic', async () => {
    const { tree, root } = await testCreateTreeWithRoot({
      topic_text: '  Trimmed Topic  ',
      user_id: userId,
    });
    createdTreeIds.push(tree.id);

    expect(tree.topic).toBe('Trimmed Topic');
    expect(root.text).toBe('Trimmed Topic');
  });

  it('rejects empty topic', async () => {
    await expect(
      testCreateTreeWithRoot({ topic_text: '   ', user_id: userId })
    ).rejects.toMatchObject({ message: 'INVALID_TOPIC', status: 422 });
  });

  it('rejects topic longer than 256 chars', async () => {
    const longTopic = 'x'.repeat(257);
    await expect(
      testCreateTreeWithRoot({ topic_text: longTopic, user_id: userId })
    ).rejects.toMatchObject({ message: 'INVALID_TOPIC', status: 422 });
  });

  it('rejects missing user_id', async () => {
    await expect(
      testCreateTreeWithRoot({ topic_text: 'Valid Topic' })
    ).rejects.toMatchObject({ message: 'MISSING_USER_ID', status: 422 });
  });

  it('enforces dedupe when enabled', async () => {
    const { tree: first } = await testCreateTreeWithRoot({
      topic_text: 'Unique Topic',
      user_id: userId,
      dedupe: true,
    });
    createdTreeIds.push(first.id);

    await expect(
      testCreateTreeWithRoot({
        topic_text: 'Unique Topic',
        user_id: userId,
        dedupe: true,
      })
    ).rejects.toMatchObject({ message: 'TREE_EXISTS', status: 409 });
  });

  it('allows duplicate topic when dedupe is false', async () => {
    const { tree: first } = await testCreateTreeWithRoot({
      topic_text: 'Same Topic',
      user_id: userId,
      dedupe: false,
    });
    createdTreeIds.push(first.id);

    const { tree: second } = await testCreateTreeWithRoot({
      topic_text: 'Same Topic',
      user_id: userId,
      dedupe: false,
    });
    createdTreeIds.push(second.id);

    expect(first.id).not.toBe(second.id);
  });
});

describe('testGetRootNodeByTreeId', () => {
  let userId;
  let treeId;

  beforeEach(async () => {
    userId = await createTestUser();
    const { tree } = await testCreateTreeWithRoot({
      topic_text: 'Repo Test Tree',
      user_id: userId,
    });
    treeId = tree.id;
  });

  afterEach(async () => {
    await cleanupTree(treeId);
    await cleanupUser(userId);
  });

  it('returns root node for valid tree', async () => {
    const root = await testGetRootNodeByTreeId(treeId);

    expect(root).toBeTruthy();
    expect(root.tree_id).toBe(treeId);
    expect(root.parent_id).toBeNull();
    expect(root.level).toBe(0);
    expect(root.text).toBe('Repo Test Tree');
  });

  it('returns null for non-existent tree', async () => {
    const fakeId = randomUUID();
    const root = await testGetRootNodeByTreeId(fakeId);
    expect(root).toBeNull();
  });
});

// Tests using the actual imported getRootNodeByTreeId from repo.js
describe('getRootNodeByTreeId (actual import)', () => {
  let userId;
  let treeId;

  beforeEach(async () => {
    userId = await createTestUser();
    const { tree } = await testCreateTreeWithRoot({
      topic_text: 'Imported Repo Test Tree',
      user_id: userId,
    });
    treeId = tree.id;
  });

  afterEach(async () => {
    await cleanupTree(treeId);
    await cleanupUser(userId);
  });

  it('returns root node via actual repo.js function', async () => {
    const root = await getRootNodeByTreeId(treeId);

    expect(root).toBeTruthy();
    expect(root.tree_id).toBe(treeId);
    expect(root.parent_id).toBeNull();
    expect(root.level).toBe(0);
    expect(root.text).toBe('Imported Repo Test Tree');
  });

  it('returns null for non-existent tree via actual repo.js', async () => {
    const fakeId = randomUUID();
    const root = await getRootNodeByTreeId(fakeId);
    expect(root).toBeNull();
  });
});

describe('testForkTreeFromNode', () => {
  let userIdA;
  let userIdB;
  let sourceTreeId;
  let sourceRootId;
  let forkedTreeIds = [];

  beforeEach(async () => {
    userIdA = await createTestUser();
    userIdB = await createTestUser();

    // Create source tree with a non-root node to fork from
    const { tree, root } = await testCreateTreeWithRoot({
      topic_text: 'Source Tree',
      user_id: userIdA,
    });
    sourceTreeId = tree.id;
    sourceRootId = root.id;

    // Add a child node to fork from
    const { rows } = await pool.query(
      `INSERT INTO nodes (tree_id, parent_id, level, role, text)
       VALUES ($1, $2, 1, 'user', 'Fork Point Node')
       RETURNING id`,
      [sourceTreeId, sourceRootId]
    );
    forkedTreeIds = [];
  });

  afterEach(async () => {
    for (const id of forkedTreeIds) {
      await cleanupTree(id);
    }
    await cleanupTree(sourceTreeId);
    await cleanupUser(userIdA);
    await cleanupUser(userIdB);
  });

  it('forks a tree from a valid node (happy path)', async () => {
    // Get the child node we created
    const { rows: nodeRows } = await pool.query(
      `SELECT id FROM nodes WHERE tree_id = $1 AND level = 1 LIMIT 1`,
      [sourceTreeId]
    );
    const forkNodeId = nodeRows[0].id;

    const { tree, root } = await testForkTreeFromNode({
      node_id: forkNodeId,
      created_by: 'user',
      user_id: userIdA,
    });
    forkedTreeIds.push(tree.id);

    expect(tree).toBeTruthy();
    expect(tree.id).not.toBe(sourceTreeId);
    expect(tree.topic).toBe('Fork Point Node');
    expect(tree.status).toBe('active');

    expect(root).toBeTruthy();
    expect(root.tree_id).toBe(tree.id);
    expect(root.parent_id).toBeNull();
    expect(root.level).toBe(0);
    expect(root.role).toBe('system');
    expect(root.text).toBe('Fork Point Node');
  });

  it('source tree remains unchanged after fork', async () => {
    const { rows: nodeRows } = await pool.query(
      `SELECT id FROM nodes WHERE tree_id = $1 AND level = 1 LIMIT 1`,
      [sourceTreeId]
    );
    const forkNodeId = nodeRows[0].id;

    const { tree: forked } = await testForkTreeFromNode({
      node_id: forkNodeId,
      created_by: 'user',
      user_id: userIdA,
    });
    forkedTreeIds.push(forked.id);

    // Check source tree still exists
    const { rows: srcTreeRows } = await pool.query(
      `SELECT * FROM trees WHERE id = $1`,
      [sourceTreeId]
    );
    expect(srcTreeRows[0]).toBeTruthy();
    expect(srcTreeRows[0].topic).toBe('Source Tree');

    // Check source nodes still exist
    const { rows: srcNodes } = await pool.query(
      `SELECT COUNT(*) as count FROM nodes WHERE tree_id = $1`,
      [sourceTreeId]
    );
    expect(parseInt(srcNodes[0].count, 10)).toBe(2); // root + child
  });

  it('rejects fork from non-existent node', async () => {
    const fakeNodeId = randomUUID();
    await expect(
      testForkTreeFromNode({ node_id: fakeNodeId, created_by: 'user', user_id: userIdA })
    ).rejects.toMatchObject({ message: 'NODE_NOT_FOUND', status: 404 });
  });

  it('rejects fork from node with empty text', async () => {
    // Create a node with empty text
    const { rows } = await pool.query(
      `INSERT INTO nodes (tree_id, parent_id, level, role, text)
       VALUES ($1, $2, 1, 'user', '')
       RETURNING id`,
      [sourceTreeId, sourceRootId]
    );
    const emptyTextNodeId = rows[0].id;

    await expect(
      testForkTreeFromNode({ node_id: emptyTextNodeId, created_by: 'user', user_id: userIdA })
    ).rejects.toMatchObject({ message: 'EMPTY_TOPIC', status: 422 });
  });

  it('enforces dedupe when enabled', async () => {
    const { rows: nodeRows } = await pool.query(
      `SELECT id FROM nodes WHERE tree_id = $1 AND level = 1 LIMIT 1`,
      [sourceTreeId]
    );
    const forkNodeId = nodeRows[0].id;

    const { tree: first } = await testForkTreeFromNode({
      node_id: forkNodeId,
      created_by: 'user',
      dedupe: true,
      user_id: userIdA,
    });
    forkedTreeIds.push(first.id);

    await expect(
      testForkTreeFromNode({
        node_id: forkNodeId,
        created_by: 'user',
        dedupe: true,
        user_id: userIdA,
      })
    ).rejects.toMatchObject({ message: 'TREE_EXISTS', status: 409 });
  });

  it('rejects fork from soft-deleted node', async () => {
    const { rows: nodeRows } = await pool.query(
      `SELECT id FROM nodes WHERE tree_id = $1 AND level = 1 LIMIT 1`,
      [sourceTreeId]
    );
    const nodeId = nodeRows[0].id;

    // Soft delete the node
    await pool.query(
      `UPDATE nodes SET soft_deleted_at = NOW() WHERE id = $1`,
      [nodeId]
    );

    await expect(
      testForkTreeFromNode({ node_id: nodeId, created_by: 'user', user_id: userIdA })
    ).rejects.toMatchObject({ message: 'NODE_NOT_FOUND', status: 404 });
  });
});

describe('Tree ownership isolation', () => {
  let userIdA;
  let userIdB;
  let treeIdA;
  let treeIdB;

  beforeEach(async () => {
    userIdA = await createTestUser();
    userIdB = await createTestUser();

    const { tree: treeA } = await testCreateTreeWithRoot({
      topic_text: 'User A Tree',
      user_id: userIdA,
    });
    treeIdA = treeA.id;

    const { tree: treeB } = await testCreateTreeWithRoot({
      topic_text: 'User B Tree',
      user_id: userIdB,
    });
    treeIdB = treeB.id;
  });

  afterEach(async () => {
    await cleanupTree(treeIdA);
    await cleanupTree(treeIdB);
    await cleanupUser(userIdA);
    await cleanupUser(userIdB);
  });

  it('different users have different trees', async () => {
    // Query trees for each user
    const { rows: treesA } = await pool.query(
      `SELECT * FROM trees WHERE user_id = $1`,
      [userIdA]
    );
    const { rows: treesB } = await pool.query(
      `SELECT * FROM trees WHERE user_id = $1`,
      [userIdB]
    );

    expect(treesA.length).toBe(1);
    expect(treesB.length).toBe(1);
    expect(treesA[0].topic).toBe('User A Tree');
    expect(treesB[0].topic).toBe('User B Tree');
    expect(treesA[0].id).not.toBe(treesB[0].id);
  });

  it('user cannot access other user tree by id in ownership query', async () => {
    // Simulate ownership check - tree belongs to user A, query as user B
    const { rows } = await pool.query(
      `SELECT * FROM trees WHERE id = $1 AND user_id = $2`,
      [treeIdA, userIdB]
    );
    expect(rows.length).toBe(0);
  });
});
