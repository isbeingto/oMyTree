import treeEngine from "../../lib/tree_engine.js";
import { init as initPgAdapter } from "./adapters/pg.js";
import TreeSyncBus from "../../events/tree_sync.js";

let adapter = null;
let adapterName = "memory";
let loggerRef = console;

function normalizeAdapterName(raw) {
  if (typeof raw !== "string") {
    return "memory";
  }

  const normalized = raw.trim().toLowerCase();
  return normalized || "memory";
}

function coerceBooleanEnv(raw) {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function acceptDevEndpointsEnabled() {
  return coerceBooleanEnv(process.env.ACCEPT_DEV_ENDPOINTS);
}

export async function initTreeService({ logger } = {}) {
  if (logger && typeof logger.info === "function") {
    loggerRef = logger;
  }

  adapterName = normalizeAdapterName(process.env.TREE_ADAPTER);

  if (adapterName === "pg") {
    adapter = await initPgAdapter({ logger: loggerRef });
    await treeEngine.attachAdapter(adapter);
  } else {
    adapter = null;
    treeEngine.bootstrapBaseline();
  }

  return { engine: treeEngine, adapter };
}

export function getTreeEngineInstance() {
  return treeEngine;
}

export function getTreeAdapter() {
  return adapter;
}

export function getTreeAdapterName() {
  return adapter?.name ?? adapterName;
}

export async function resetTree(traceId = null) {
  if (!adapter || typeof adapter.reset !== "function") {
    throw new Error("adapter does not support reset");
  }

  await adapter.reset();
  await reloadTreeSnapshotFromAdapter();
  
  // Emit tree_reset event
  TreeSyncBus.emit(TreeSyncBus.EVENT_TYPES.TREE_RESET, {}, traceId);
}

export async function reloadTreeSnapshotFromAdapter() {
  if (!adapter) {
    return treeEngine.getSnapshot();
  }

  try {
    const snapshot = await adapter.loadSnapshot();
    treeEngine.applySnapshot(snapshot);
    return snapshot;
  } catch (err) {
    loggerRef.error?.("[tree-service] failed to reload snapshot", err);
    return treeEngine.getSnapshot();
  }
}

export async function loadDemoSnapshot() {
  if (adapter && typeof adapter.snapshotDemo === "function") {
    try {
      return await adapter.snapshotDemo();
    } catch (err) {
      loggerRef.error?.("[tree-service] snapshotDemo failed", err);
    }
  }

  return treeEngine.getSnapshot();
}

export async function getTreePersistenceMetrics() {
  if (!adapter) {
    return {
      dbUp: 0,
      nodesTotal: treeEngine.size(),
      edgesTotal: treeEngine.edgeSize(),
      persistTotal: 0,
    };
  }

  if (typeof adapter.getTotals === "function") {
    try {
      return await adapter.getTotals();
    } catch (err) {
      loggerRef.error?.("[tree-service] adapter.getTotals failed", err);
      return {
        dbUp: 0,
        nodesTotal: 0,
        edgesTotal: 0,
        persistTotal: 0,
      };
    }
  }

  return {
    dbUp: 1,
    nodesTotal: treeEngine.size(),
    edgesTotal: treeEngine.edgeSize(),
    persistTotal: 0,
  };
}

export async function importSnapshot(snapshot, opts = {}) {
  if (!adapter || typeof adapter.bulkImport !== "function") {
    throw new Error("adapter does not support bulkImport");
  }

  try {
    const result = await adapter.bulkImport(snapshot, opts);
    
    // Reload the tree engine with the new data
    if (typeof adapter.loadSnapshot === "function") {
      const newSnapshot = await adapter.loadSnapshot();
      treeEngine.applySnapshot(newSnapshot);
    }
    
    // Emit tree_imported event
    TreeSyncBus.emit(TreeSyncBus.EVENT_TYPES.TREE_IMPORTED, {
      nodes_count: result.nodes_inserted || 0,
      edges_count: result.edges_inserted || 0,
    }, opts.traceId);
    
    return result;
  } catch (err) {
    loggerRef.error?.("[tree-service] importSnapshot failed", err);
    throw err;
  }
}

export async function addNode({ tree, label, parent_id, meta }, traceId = null) {
  if (!adapter || typeof adapter.insertNode !== "function") {
    throw new Error("adapter does not support addNode");
  }

  const node = await adapter.insertNode(null, { tree, label, parent_id, meta });
  await reloadTreeSnapshotFromAdapter();
  
  // Emit node_created event
  TreeSyncBus.emit(TreeSyncBus.EVENT_TYPES.NODE_CREATED, {
    node_id: node.id,
    label: node.label,
    parent_id: node.parent_id,
    tree,
  }, traceId);
  
  return node;
}

export async function addEdge({ tree, parent_id, child_id }, traceId = null) {
  if (!adapter || typeof adapter.insertEdge !== "function") {
    throw new Error("adapter does not support addEdge");
  }

  const edge = await adapter.insertEdge(null, { tree, parent_id, child_id });
  await reloadTreeSnapshotFromAdapter();
  
  // Emit edge_created event
  TreeSyncBus.emit(TreeSyncBus.EVENT_TYPES.EDGE_CREATED, {
    edge_id: edge.id,
    parent_id: edge.parent_id,
    child_id: edge.child_id,
    tree,
  }, traceId);
  
  return edge;
}

export async function grow({ tree, parent_id = 'root', label, meta }, traceId = null) {
  if (!adapter || typeof adapter.growTx !== "function") {
    throw new Error("adapter does not support grow");
  }

  const result = await adapter.growTx({ tree, parent_id, label, meta });
  await reloadTreeSnapshotFromAdapter();
  
  // Emit tree_grown event
  TreeSyncBus.emit(TreeSyncBus.EVENT_TYPES.TREE_GROWN, {
    node_id: result.node?.id,
    edge_id: result.edge?.id,
    label,
    parent_id,
    tree,
  }, traceId);
  
  return result;
}

export async function createSnapshot({ tree = "demo", meta = null }, traceId = null) {
  if (!adapter || typeof adapter.saveSnapshot !== "function") {
    throw new Error("adapter does not support snapshots");
  }

  const snapshot = await adapter.saveSnapshot({ tree, meta });
  
  // Emit tree_snapshot_created event
  TreeSyncBus.emit(TreeSyncBus.EVENT_TYPES.TREE_SNAPSHOT_CREATED, {
    id: snapshot.id,
    tree: snapshot.tree,
    totals: snapshot.totals,
  }, traceId);
  
  return snapshot;
}

export async function listSnapshots({ tree = "demo", limit = 20 } = {}) {
  if (!adapter || typeof adapter.listSnapshots !== "function") {
    throw new Error("adapter does not support snapshots");
  }

  return await adapter.listSnapshots({ tree, limit });
}

export async function getSnapshotById(snapshotId) {
  if (!adapter || typeof adapter.getSnapshot !== "function") {
    throw new Error("adapter does not support snapshots");
  }

  return await adapter.getSnapshot(snapshotId);
}

export async function replaySnapshot(snapshotId, traceId = null) {
  if (!adapter || typeof adapter.replaySnapshot !== "function") {
    throw new Error("adapter does not support snapshots");
  }

  const result = await adapter.replaySnapshot(snapshotId);
  await reloadTreeSnapshotFromAdapter();
  
  // Emit tree_replayed event
  TreeSyncBus.emit(TreeSyncBus.EVENT_TYPES.TREE_REPLAYED, {
    id: result.id,
    tree: result.tree,
    totals: result.totals,
  }, traceId);
  
  return result;
}

