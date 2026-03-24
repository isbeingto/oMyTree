import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import pkg from "pg";

const { Pool } = pkg;

const DEFAULT_STATEMENT_TIMEOUT_MS = 1500;
const INIT_SQL_PATH = fileURLToPath(new URL("../../../../database/sql/init_pg.sql", import.meta.url));

function resolveSslMode(raw) {
  if (typeof raw !== "string") {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === "disable") {
    return false;
  }

  if (normalized === "require" || normalized === "verify-ca" || normalized === "verify-full") {
    return { rejectUnauthorized: normalized !== "require" };
  }

  return null;
}

function parseTimeout(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.trunc(value);
}

function parsePoolMax(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.trunc(value);
}

function resolvePoolConfig() {
  const dsn = process.env.PG_DSN || process.env.DATABASE_URL || null;
  const statementTimeout = parseTimeout(process.env.PG_STATEMENT_TIMEOUT, DEFAULT_STATEMENT_TIMEOUT_MS);
  const connectTimeout = parseTimeout(process.env.PGCONNECT_TIMEOUT, 0);
  const poolMax = parsePoolMax(process.env.PG_TREE_ADAPTER_POOL_MAX, 10);
  const sslMode = resolveSslMode(process.env.PGSSLMODE);

  const base = {
    max: poolMax,
    statement_timeout: statementTimeout,
    query_timeout: statementTimeout,
  };

  if (connectTimeout > 0) {
    base.connectionTimeoutMillis = connectTimeout * 1000;
  }

  if (sslMode !== null) {
    base.ssl = sslMode;
  }

  if (dsn) {
    return { ...base, connectionString: dsn };
  }

  return {
    ...base,
    host: process.env.PGHOST || "127.0.0.1",
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || "omytree",
    password: process.env.PGPASSWORD || "",
    database: process.env.PGDATABASE || "omytree",
  };
}

function normalizeId(raw) {
  if (typeof raw !== "string") {
    return "";
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function mapNodeRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    label: row.label,
    parent_id: row.parent_id ?? null,
    meta: row.meta ?? {},
    created_at: parseBigint(row.created_at),
  };
}

function mapEdgeRow(row) {
  if (!row) {
    return null;
  }

  const edge = {
    id: row.id,
    source: row.source,
    target: row.target,
    created_at: parseBigint(row.created_at),
  };

  if (row.label) {
    edge.label = row.label;
  }

  edge.meta = row.meta ?? {};

  return edge;
}

async function ensureSchema(pool, logger) {
  const sql = await readFile(INIT_SQL_PATH, "utf8");
  try {
    await pool.query(sql);
  } catch (err) {
    logger.error?.("[tree-adapter:pg] schema initialization failed", err);
    throw err;
  }
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }
  return meta;
}

function toDate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Math.trunc(value));
  }
  if (value instanceof Date) {
    return value;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return new Date(Math.trunc(parsed));
  }
  return new Date();
}

function parseBigint(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.trunc(num);
}

function buildSeedDataset() {
  const baseTs = Date.now();
  const nodes = SEED_NODES.map((node, index) => ({
    id: node.id,
    label: node.label,
    parent_id: node.parentId,
    meta: node.meta,
    created_at: baseTs + index,
  }));

  const edges = nodes
    .map((node, index) => {
      if (!node.parent_id) {
        return null;
      }
      return {
        id: `edge:${node.parent_id}->${node.id}:${baseTs + index}`,
        source: node.parent_id,
        target: node.id,
        label: node.meta.label ?? node.label,
        created_at: baseTs + index,
      };
    })
    .filter(Boolean);

  return { nodes, edges };
}

function buildBaselineDataset() {
  const baseTs = Date.now();
  const nodes = BASELINE_NODES.map((node, index) => ({
    id: node.id,
    label: node.label,
    parent_id: node.parentId,
    meta: node.meta,
    created_at: baseTs + index,
  }));

  const edges = nodes
    .map((node, index) => {
      if (!node.parent_id) {
        return null;
      }
      return {
        id: `edge:${node.parent_id}->${node.id}:${baseTs + index}`,
        source: node.parent_id,
        target: node.id,
        label: "baseline",
        created_at: baseTs + index,
      };
    })
    .filter(Boolean);

  return { nodes, edges };
}

async function runWithClient(pool, fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function writeNodes(client, nodes) {
  if (!nodes || nodes.length === 0) {
    return;
  }

  const text = `INSERT INTO tree_nodes (id, label, parent_id, meta, created_at, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label,
      parent_id = EXCLUDED.parent_id,
      meta = EXCLUDED.meta,
      updated_at = NOW()`;

  for (const node of nodes) {
    await client.query(text, [
      node.id,
      node.label,
      node.parent_id,
      JSON.stringify(sanitizeMeta(node.meta)),
      toDate(node.created_at),
    ]);
  }
}

async function writeEdges(client, edges) {
  if (!edges || edges.length === 0) {
    return;
  }

  const text = `INSERT INTO tree_edges (id, source, target, label, meta, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
    ON CONFLICT (id) DO UPDATE SET
      source = EXCLUDED.source,
      target = EXCLUDED.target,
      label = EXCLUDED.label,
      meta = EXCLUDED.meta,
      updated_at = NOW()`;

  for (const edge of edges) {
    await client.query(text, [
      edge.id,
      edge.source,
      edge.target,
      edge.label ?? null,
      JSON.stringify(sanitizeMeta(edge.meta ?? {})),
      toDate(edge.created_at),
    ]);
  }
}

async function updatePersistTotal(client, by = 1) {
  const { rows } = await client.query(
    "SELECT val FROM tree_meta WHERE key = 'persist_total' FOR UPDATE",
  );
  const current = rows.length > 0 ? parseBigint(rows[0].val?.value ?? rows[0].val?.count ?? 0) : 0;
  const next = by + current;
  const payload = JSON.stringify({ value: next });
  const key = "persist_total";

  if (rows.length > 0) {
    await client.query(
      "UPDATE tree_meta SET val = $2::jsonb, updated_at = NOW() WHERE key = $1",
      [key, payload],
    );
  } else {
    await client.query(
      "INSERT INTO tree_meta (key, val) VALUES ($1, $2::jsonb)",
      [key, payload],
    );
  }

  return next;
}

function createAdapter(pool, logger, statementTimeout) {
  async function replaceDataset(snapshot, { skipPersistTotal = false } = {}) {
    return runWithClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM tree_edges");
        await client.query("DELETE FROM tree_nodes");

        const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
        const edges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];

        await writeNodes(client, nodes);
        await writeEdges(client, edges);

        if (!skipPersistTotal) {
          await updatePersistTotal(client, 1);
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  }

  async function reset() {
    const baseline = buildBaselineDataset();
    await replaceDataset(baseline, { skipPersistTotal: true });
  }

  async function seed() {
    const dataset = buildSeedDataset();
    await replaceDataset(dataset, { skipPersistTotal: false });
  }

  async function loadSnapshot() {
    return runWithClient(pool, async (client) => {
      const nodesResult = await client.query(
        `SELECT id, label, parent_id, meta, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at
           FROM tree_nodes
          ORDER BY created_at ASC, id ASC`,
      );
      const edgesResult = await client.query(
        `SELECT id, source, target, label, meta, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at
           FROM tree_edges
          ORDER BY created_at ASC, id ASC`,
      );

      return {
        nodes: nodesResult.rows.map(mapNodeRow).filter(Boolean),
        edges: edgesResult.rows.map(mapEdgeRow).filter(Boolean),
      };
    });
  }

  async function snapshotDemo() {
    return loadSnapshot();
  }

  async function getNode(id) {
    const normalized = normalizeId(id);
    if (!normalized) {
      return null;
    }

    const { rows } = await pool.query(
      `SELECT id, label, parent_id, meta, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at
         FROM tree_nodes
        WHERE id = $1
        LIMIT 1`,
      [normalized],
    );

    return rows.length > 0 ? mapNodeRow(rows[0]) : null;
  }

  async function getEdge(id) {
    const normalized = normalizeId(id);
    if (!normalized) {
      return null;
    }

    const { rows } = await pool.query(
      `SELECT id, source, target, label, meta, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at
         FROM tree_edges
        WHERE id = $1
        LIMIT 1`,
      [normalized],
    );

    return rows.length > 0 ? mapEdgeRow(rows[0]) : null;
  }

  async function listNodes() {
    const { rows } = await pool.query(
      `SELECT id, label, parent_id, meta, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at
         FROM tree_nodes
        ORDER BY created_at ASC, id ASC`,
    );

    return rows.map(mapNodeRow).filter(Boolean);
  }

  async function listEdges() {
    const { rows } = await pool.query(
      `SELECT id, source, target, label, meta, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at
         FROM tree_edges
        ORDER BY created_at ASC, id ASC`,
    );

    return rows.map(mapEdgeRow).filter(Boolean);
  }

  async function getPersistTotal(clientArg) {
    const executor = clientArg
      ? async () => clientArg.query("SELECT val FROM tree_meta WHERE key = 'persist_total'")
      : () => pool.query("SELECT val FROM tree_meta WHERE key = 'persist_total'");

    try {
      const { rows } = await executor();
      if (rows.length === 0) {
        return 0;
      }
      const raw = rows[0].val;
      if (raw && typeof raw === "object") {
        const value = raw.value ?? raw.count ?? raw.total;
        return parseBigint(value);
      }
      return 0;
    } catch (err) {
      logger.error?.("[tree-adapter:pg] failed to read persist_total", err);
      return 0;
    }
  }

  async function getTotals() {
    try {
      const snapshot = await loadSnapshot();
      const persistTotal = await getPersistTotal();
      return {
        dbUp: 1,
        nodesTotal: snapshot.nodes.length,
        edgesTotal: snapshot.edges.length,
        persistTotal,
      };
    } catch (err) {
      logger.error?.("[tree-adapter:pg] failed to gather totals", err);
      return {
        dbUp: 0,
        nodesTotal: 0,
        edgesTotal: 0,
        persistTotal: 0,
      };
    }
  }

  async function upsertNode(node) {
    await pool.query(
      `INSERT INTO tree_nodes (id, label, parent_id, meta, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label,
           parent_id = EXCLUDED.parent_id,
           meta = EXCLUDED.meta,
           updated_at = NOW()`,
      [
        node.id,
        node.label,
        node.parent_id ?? null,
        JSON.stringify(sanitizeMeta(node.meta)),
        toDate(node.created_at),
      ],
    );
  }

  async function upsertEdge(edge) {
    await pool.query(
      `INSERT INTO tree_edges (id, source, target, label, meta, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
         ON CONFLICT (id) DO UPDATE SET
           source = EXCLUDED.source,
           target = EXCLUDED.target,
           label = EXCLUDED.label,
           meta = EXCLUDED.meta,
           updated_at = NOW()`,
      [
        edge.id,
        edge.source,
        edge.target,
        edge.label ?? null,
        JSON.stringify(sanitizeMeta(edge.meta ?? {})),
        toDate(edge.created_at),
      ],
    );
  }

  async function incrementPersistTotal(by = 1) {
    return runWithClient(pool, (client) => updatePersistTotal(client, by));
  }

  async function bulkImport(snapshot, { mode = "truncate-then-import" } = {}) {
    return runWithClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
        const edges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];

        if (mode === "truncate-then-import") {
          // Delete all edges first (due to foreign key constraints)
          await client.query("DELETE FROM tree_edges");
          await client.query("DELETE FROM tree_nodes");

          // Insert nodes
          for (const node of nodes) {
            await client.query(
              `INSERT INTO tree_nodes (id, label, parent_id, meta, created_at, updated_at)
               VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
              [
                node.id,
                node.label,
                node.parent_id ?? null,
                JSON.stringify(sanitizeMeta(node.meta)),
                toDate(node.created_at),
                toDate(node.updated_at || node.created_at),
              ]
            );
          }

          // Insert edges
          for (const edge of edges) {
            await client.query(
              `INSERT INTO tree_edges (id, source, target, label, meta, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
              [
                edge.id,
                edge.source,
                edge.target,
                edge.label ?? null,
                JSON.stringify(sanitizeMeta(edge.meta ?? {})),
                toDate(edge.created_at),
                toDate(edge.updated_at || edge.created_at),
              ]
            );
          }
        } else if (mode === "merge-upsert") {
          // Upsert nodes
          for (const node of nodes) {
            await client.query(
              `INSERT INTO tree_nodes (id, label, parent_id, meta, created_at, updated_at)
               VALUES ($1, $2, $3, $4::jsonb, $5, $6)
               ON CONFLICT (id) DO UPDATE SET
                 label = EXCLUDED.label,
                 parent_id = EXCLUDED.parent_id,
                 meta = EXCLUDED.meta,
                 updated_at = EXCLUDED.updated_at`,
              [
                node.id,
                node.label,
                node.parent_id ?? null,
                JSON.stringify(sanitizeMeta(node.meta)),
                toDate(node.created_at),
                toDate(node.updated_at || node.created_at),
              ]
            );
          }

          // Upsert edges
          for (const edge of edges) {
            await client.query(
              `INSERT INTO tree_edges (id, source, target, label, meta, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
               ON CONFLICT (id) DO UPDATE SET
                 source = EXCLUDED.source,
                 target = EXCLUDED.target,
                 label = EXCLUDED.label,
                 meta = EXCLUDED.meta,
                 updated_at = EXCLUDED.updated_at`,
              [
                edge.id,
                edge.source,
                edge.target,
                edge.label ?? null,
                JSON.stringify(sanitizeMeta(edge.meta ?? {})),
                toDate(edge.created_at),
                toDate(edge.updated_at || edge.created_at),
              ]
            );
          }
        }

        await client.query("COMMIT");
        return { nodes: nodes.length, edges: edges.length };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  }

  async function checkHealth(timeoutMs = statementTimeout) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutHandle;
    let queryTask;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        if (controller) {
          controller.abort();
        }
        reject(new Error("timeout"));
      }, timeoutMs);
    });

    try {
      queryTask = pool.query(
        controller ? { text: "SELECT 1", signal: controller.signal } : { text: "SELECT 1" },
      );
      await Promise.race([queryTask, timeoutPromise]);
      return true;
    } catch (err) {
      logger.error?.("[tree-adapter:pg] readiness query failed", err);
      return false;
    } finally {
      clearTimeout(timeoutHandle);
      if (queryTask) {
        queryTask.catch(() => {});
      }
    }
  }

  async function close() {
    await pool.end();
  }

  async function insertNode(client, { tree, label, parent_id, meta }) {
    const nodeId = `${tree}:${label}:${Date.now()}`;
    const createdAt = Date.now();
    
    const executor = client || pool;
    
    await executor.query(
      `INSERT INTO tree_nodes (id, label, parent_id, meta, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW())`,
      [
        nodeId,
        label,
        parent_id ?? null,
        JSON.stringify(sanitizeMeta(meta)),
        toDate(createdAt),
      ]
    );

    return {
      id: nodeId,
      label,
      parent_id: parent_id ?? null,
      meta: sanitizeMeta(meta),
      created_at: createdAt,
    };
  }

  async function insertEdge(client, { tree, parent_id, child_id }) {
    const edgeId = `edge:${parent_id}->${child_id}:${Date.now()}`;
    const createdAt = Date.now();

    const executor = client || pool;

    await executor.query(
      `INSERT INTO tree_edges (id, source, target, label, meta, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())`,
      [
        edgeId,
        parent_id,
        child_id,
        null,
        JSON.stringify({}),
        toDate(createdAt),
      ]
    );

    return {
      id: edgeId,
      source: parent_id,
      target: child_id,
      created_at: createdAt,
    };
  }

  async function growTx({ tree, parent_id = 'root', label, meta }) {
    return runWithClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        if (parent_id === label) {
          await client.query("ROLLBACK");
          throw new Error("parent_id cannot equal child label (cycle detected)");
        }

        const parentCheck = await client.query(
          "SELECT id FROM tree_nodes WHERE id = $1 LIMIT 1",
          [parent_id]
        );

        if (parentCheck.rowCount === 0) {
          await client.query("ROLLBACK");
          throw new Error("parent_id not found");
        }

        const node = await insertNode(client, { tree, label, parent_id, meta });
        const edge = await insertEdge(client, { tree, parent_id, child_id: node.id });

        await updatePersistTotal(client, 1);
        await client.query("COMMIT");

        return { node, edge };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  }

  async function saveSnapshot({ tree = "demo", meta = null } = {}) {
    return runWithClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        // Load current tree state
        const nodes = await listNodes(client);
        const edges = await listEdges(client);

        // Calculate size in bytes (approximate JSON size)
        const nodesJson = JSON.stringify(nodes);
        const edgesJson = JSON.stringify(edges);
        const totalSizeBytes = Buffer.byteLength(nodesJson, 'utf8') + Buffer.byteLength(edgesJson, 'utf8');
        const maxSizeBytes = 5 * 1024 * 1024; // 5MB

        if (totalSizeBytes > maxSizeBytes) {
          await client.query("ROLLBACK");
          throw new Error(`snapshot exceeds 5MB limit (${totalSizeBytes} bytes)`);
        }

        // Insert snapshot
        const result = await client.query(
          `INSERT INTO tree_snapshots (tree, meta, nodes, edges, created_at)
           VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, NOW())
           RETURNING id, tree, created_at, meta`,
          [tree, meta ? JSON.stringify(meta) : null, nodesJson, edgesJson]
        );

        await client.query("COMMIT");

        const snapshot = result.rows[0];
        return {
          id: snapshot.id,
          tree: snapshot.tree,
          created_at: snapshot.created_at?.toISOString() || new Date().toISOString(),
          meta: snapshot.meta || null,
          totals: {
            nodes: nodes.length,
            edges: edges.length,
          },
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  }

  async function listSnapshots({ tree = "demo", limit = 20 } = {}) {
    const result = await pool.query(
      `SELECT id, tree, created_at, meta, 
              jsonb_array_length(nodes) as nodes_count,
              jsonb_array_length(edges) as edges_count
       FROM tree_snapshots
       WHERE tree = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tree, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      tree: row.tree,
      created_at: row.created_at?.toISOString() || null,
      meta: row.meta || null,
      totals: {
        nodes: parseInt(row.nodes_count, 10) || 0,
        edges: parseInt(row.edges_count, 10) || 0,
      },
    }));
  }

  async function getSnapshot(snapshotId) {
    const result = await pool.query(
      `SELECT id, tree, created_at, meta, nodes, edges
       FROM tree_snapshots
       WHERE id = $1
       LIMIT 1`,
      [snapshotId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const nodes = Array.isArray(row.nodes) ? row.nodes : [];
    const edges = Array.isArray(row.edges) ? row.edges : [];

    return {
      id: row.id,
      tree: row.tree,
      created_at: row.created_at?.toISOString() || null,
      meta: row.meta || null,
      nodes,
      edges,
      totals: {
        nodes: nodes.length,
        edges: edges.length,
      },
    };
  }

  async function replaySnapshot(snapshotId) {
    return runWithClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        // Get the snapshot
        const result = await client.query(
          `SELECT id, tree, nodes, edges
           FROM tree_snapshots
           WHERE id = $1
           LIMIT 1`,
          [snapshotId]
        );

        if (result.rows.length === 0) {
          await client.query("ROLLBACK");
          throw new Error("snapshot not found");
        }

        const snapshot = result.rows[0];
        const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
        const edges = Array.isArray(snapshot.edges) ? snapshot.edges : [];

        // Clear existing data (truncate-then-import)
        await client.query("DELETE FROM tree_edges");
        await client.query("DELETE FROM tree_nodes");

        // Insert nodes
        for (const node of nodes) {
          await client.query(
            `INSERT INTO tree_nodes (id, label, parent_id, meta, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
            [
              node.id,
              node.label,
              node.parent_id ?? null,
              JSON.stringify(sanitizeMeta(node.meta)),
              toDate(node.created_at),
              toDate(node.updated_at || node.created_at),
            ]
          );
        }

        // Insert edges
        for (const edge of edges) {
          await client.query(
            `INSERT INTO tree_edges (id, source, target, label, meta, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
            [
              edge.id,
              edge.source,
              edge.target,
              edge.label ?? null,
              JSON.stringify(sanitizeMeta(edge.meta ?? {})),
              toDate(edge.created_at),
              toDate(edge.updated_at || edge.created_at),
            ]
          );
        }

        await client.query("COMMIT");

        return {
          id: snapshot.id,
          tree: snapshot.tree,
          totals: {
            nodes: nodes.length,
            edges: edges.length,
          },
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  }

  return {
    name: "pg",
    pool,
    replaceDataset,
    reset,
    seed,
    loadSnapshot,
    snapshotDemo,
    getNode,
    getEdge,
    listNodes,
    listEdges,
    getTotals,
    getPersistTotal,
    upsertNode,
    upsertEdge,
    incrementPersistTotal,
    bulkImport,
    checkHealth,
    close,
    insertNode,
    insertEdge,
    growTx,
    saveSnapshot,
    listSnapshots,
    getSnapshot,
    replaySnapshot,
  };
}

export async function init({ logger = console } = {}) {
  const config = resolvePoolConfig();
  const statementTimeout = config.statement_timeout || DEFAULT_STATEMENT_TIMEOUT_MS;
  const pool = new Pool(config);

  pool.on('error', (err) => {
    logger.error?.('[tree-adapter:pg] Unexpected error on idle client in pool', {
      message: err.message,
      code: err.code,
      severity: err.severity,
    });
  });

  pool.on("connect", async (client) => {
    try {
      await client.query(`SET statement_timeout TO ${statementTimeout}`);
      await client.query("SET TIME ZONE 'UTC'");
    } catch (err) {
      logger.error?.("[tree-adapter:pg] failed to set session parameters", err);
    }
  });

  await ensureSchema(pool, logger);

  return createAdapter(pool, logger, statementTimeout);
}

const BASELINE_NODES = [
  { id: "root", label: "Root", parentId: null, meta: { source: "baseline" } },
  { id: "demo-root", label: "Demo Root", parentId: "root", meta: { source: "baseline" } },
  { id: "demo-bridge", label: "Bridge", parentId: "demo-root", meta: { source: "baseline" } },
  { id: "demo-bridge-metrics", label: "Metrics", parentId: "demo-bridge", meta: { source: "baseline" } },
  { id: "demo-bridge-ssr", label: "SSR Snapshot", parentId: "demo-bridge", meta: { source: "baseline" } },
  { id: "demo-bridge-future", label: "Future Signals", parentId: "demo-bridge", meta: { source: "baseline" } },
  { id: "demo-tree", label: "Tree", parentId: "demo-root", meta: { source: "baseline" } },
  { id: "demo-tree-layout", label: "Layout", parentId: "demo-tree", meta: { source: "baseline" } },
  { id: "demo-tree-hooks", label: "Hooks", parentId: "demo-tree", meta: { source: "baseline" } },
];

const SEED_NODES = [
  { id: "root", label: "Root", parentId: null, meta: { source: "seed" } },
  { id: "demo-root", label: "Demo Root", parentId: "root", meta: { source: "seed" } },
  { id: "demo-bridge", label: "Bridge", parentId: "demo-root", meta: { source: "seed", group: "bridge" } },
  { id: "demo-bridge-metrics", label: "Metrics", parentId: "demo-bridge", meta: { source: "seed", group: "bridge" } },
  { id: "demo-bridge-ssr", label: "SSR Snapshot", parentId: "demo-bridge", meta: { source: "seed", group: "bridge" } },
  { id: "demo-bridge-future", label: "Future Signals", parentId: "demo-bridge", meta: { source: "seed", group: "bridge" } },
  { id: "demo-tree", label: "Tree", parentId: "demo-root", meta: { source: "seed", group: "engine" } },
  { id: "demo-tree-layout", label: "Layout", parentId: "demo-tree", meta: { source: "seed", group: "engine" } },
  { id: "demo-tree-hooks", label: "Hooks", parentId: "demo-tree", meta: { source: "seed", group: "engine" } },
  { id: "demo-bridge-streams", label: "Streams", parentId: "demo-bridge", meta: { source: "seed", group: "bridge" } },
  { id: "demo-bridge-cache", label: "Cache", parentId: "demo-bridge", meta: { source: "seed", group: "bridge" } },
  { id: "demo-tree-pg-adapter", label: "PG Adapter", parentId: "demo-tree", meta: { source: "seed", group: "engine" } },
  { id: "demo-tree-snapshot", label: "Snapshot", parentId: "demo-tree", meta: { source: "seed", group: "engine" } },
  { id: "demo-tree-reloader", label: "Reloader", parentId: "demo-tree", meta: { source: "seed", group: "engine" } },
  { id: "demo-tree-migrations", label: "Migrations", parentId: "demo-tree", meta: { source: "seed", group: "engine" } },
  { id: "demo-persistence", label: "Persistence", parentId: "demo-root", meta: { source: "seed", group: "persistence" } },
  { id: "demo-persistence-snapshot", label: "Snapshot Writer", parentId: "demo-persistence", meta: { source: "seed", group: "persistence" } },
  { id: "demo-persistence-replay", label: "Replay", parentId: "demo-persistence", meta: { source: "seed", group: "persistence" } },
  { id: "demo-persistence-metrics", label: "Metrics", parentId: "demo-persistence", meta: { source: "seed", group: "persistence" } },
  { id: "demo-persistence-monitor", label: "Monitor", parentId: "demo-persistence", meta: { source: "seed", group: "persistence" } },
  { id: "demo-observe", label: "Observe", parentId: "demo-root", meta: { source: "seed", group: "observe" } },
  { id: "demo-observe-readyz", label: "Ready Probe", parentId: "demo-observe", meta: { source: "seed", group: "observe" } },
  { id: "demo-observe-metrics", label: "Metrics Probe", parentId: "demo-observe", meta: { source: "seed", group: "observe" } },
  { id: "demo-observe-dashboard", label: "Dashboard", parentId: "demo-observe", meta: { source: "seed", group: "observe" } },
  { id: "demo-integration", label: "Integration", parentId: "demo-root", meta: { source: "seed", group: "integration" } },
  { id: "demo-integration-bus", label: "Bus", parentId: "demo-integration", meta: { source: "seed", group: "integration" } },
  { id: "demo-integration-redis", label: "Redis", parentId: "demo-integration", meta: { source: "seed", group: "integration" } },
  { id: "demo-integration-web", label: "Web", parentId: "demo-integration", meta: { source: "seed", group: "integration" } },
  { id: "demo-integration-health", label: "Health Sync", parentId: "demo-integration", meta: { source: "seed", group: "integration" } },
];
