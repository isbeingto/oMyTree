const MAX_SAFE_NODES = 1000;
const MAX_SAFE_EDGES = 2000;
const FALLBACK_PARENT_ID = "root";

function sanitizeId(rawId) {
  if (typeof rawId !== "string") {
    return null;
  }

  const trimmed = rawId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeLabel(rawLabel, fallbackId) {
  if (typeof rawLabel === "string") {
    const trimmed = rawLabel.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return fallbackId;
}

function sanitizeMeta(rawMeta = {}) {
  if (typeof rawMeta !== "object" || rawMeta === null || Array.isArray(rawMeta)) {
    return {};
  }

  const meta = {};
  for (const [key, value] of Object.entries(rawMeta)) {
    if (typeof key !== "string" || !key) {
      continue;
    }

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      meta[key] = value;
      continue;
    }

    if (value instanceof Date) {
      meta[key] = value.toISOString();
      continue;
    }

    if (typeof value === "object") {
      meta[key] = JSON.parse(JSON.stringify(value));
    }
  }

  return meta;
}

function nowTs() {
  return Date.now();
}

function sanitizeEdgeLabel(rawLabel) {
  if (typeof rawLabel === "string") {
    const trimmed = rawLabel.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function sanitizeTimestamp(rawTs) {
  if (typeof rawTs === "number" && Number.isFinite(rawTs)) {
    const truncated = Math.trunc(rawTs);
    return truncated >= 0 ? truncated : 0;
  }

  return nowTs();
}

function safeJsonClone(value) {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return JSON.parse(JSON.stringify(value));
}

class TreeEngine {
  #adapter = null;
  #hydrating = false;

  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.nodeOrder = [];
    this.edgeOrder = [];
  }

  setAdapter(adapter) {
    this.#adapter = adapter ?? null;
  }

  async attachAdapter(adapter) {
    this.setAdapter(adapter);
    if (!adapter) {
      this.bootstrapBaseline();
      return this.getSnapshot();
    }

    return this.reloadFromAdapter();
  }

  async reloadFromAdapter() {
    if (!this.#adapter || typeof this.#adapter.loadSnapshot !== "function") {
      return this.getSnapshot();
    }

    let snapshot;
    try {
      snapshot = await this.#adapter.loadSnapshot();
    } catch (err) {
      console.error("[tree-engine] failed to load snapshot from adapter", err);
      snapshot = null;
    }

    if (!snapshot || !Array.isArray(snapshot.nodes) || snapshot.nodes.length === 0) {
      this.bootstrapBaseline();
      if (typeof this.#adapter.replaceDataset === "function") {
        try {
          await this.#adapter.replaceDataset(this.getSnapshot(), { skipPersistTotal: true });
        } catch (err) {
          console.error("[tree-engine] failed to persist baseline dataset", err);
        }
      }
      return this.getSnapshot();
    }

    this.applySnapshot(snapshot);
    return this.getSnapshot();
  }

  applySnapshot(snapshot = {}) {
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
    const edges = Array.isArray(snapshot.edges) ? snapshot.edges : [];

    this.#hydrating = true;
    this.#reset();

    for (const node of nodes) {
      this.#ingestNode(node);
    }

    for (const edge of edges) {
      this.#ingestEdge(edge);
    }

    this.#hydrating = false;
    this.#purgeDanglingEdges();
    this.#enforceEdgeCap();
    this.#enforceCap();

    return this.getSnapshot();
  }

  bootstrapBaseline() {
    const baseline = buildBaselineSnapshot();
    this.applySnapshot(baseline);
  }

  hasNode(nodeId) {
    const sanitized = sanitizeId(nodeId);
    return sanitized ? this.nodes.has(sanitized) : false;
  }

  size() {
    return this.nodeOrder.length;
  }

  edgeSize() {
    return this.edgeOrder.length;
  }

  addNode({ id, label, parentId = null, meta = {}, edgeLabel = null }) {
    const sanitizedId = sanitizeId(id);
    if (!sanitizedId) {
      return { created: false, node: null, edge: null };
    }

    if (this.nodes.has(sanitizedId)) {
      return { created: false, node: this.nodes.get(sanitizedId), edge: null };
    }

    const storedLabel = sanitizeLabel(label, sanitizedId);
    const storedMeta = sanitizeMeta(meta);
    const createdAt = sanitizeTimestamp(nowTs());

    let parent = sanitizeId(parentId);
    if (parent === sanitizedId) {
      parent = null;
    }

    if (parent && !this.nodes.has(parent)) {
      const fallback = sanitizeId(FALLBACK_PARENT_ID);
      parent = fallback && this.nodes.has(fallback) ? fallback : null;
    }

    const node = {
      id: sanitizedId,
      label: storedLabel,
      parent_id: parent ?? null,
      meta: storedMeta,
      created_at: createdAt,
    };

    this.nodes.set(sanitizedId, node);
    this.nodeOrder.push(sanitizedId);

    let edge = null;
    if (parent) {
      const edgeId = `edge:${parent}->${sanitizedId}:${createdAt}`;
      edge = this.#addEdge({
        id: edgeId,
        source: parent,
        target: sanitizedId,
        label: sanitizeEdgeLabel(edgeLabel) ?? sanitizeEdgeLabel(storedLabel),
        created_at: createdAt,
      });
    }

    this.#enforceCap();

    this.#queuePersist({ node, edge, created: true });

    return { created: true, node, edge };
  }

  #queuePersist({ node, edge, created }) {
    if (!this.#adapter || this.#hydrating || !created) {
      return;
    }

    const persistTask = async () => {
      try {
        if (typeof this.#adapter.upsertNode === "function") {
          await this.#adapter.upsertNode(node);
        }
        if (edge && typeof this.#adapter.upsertEdge === "function") {
          await this.#adapter.upsertEdge(edge);
        }
        if (typeof this.#adapter.incrementPersistTotal === "function") {
          await this.#adapter.incrementPersistTotal(1);
        }
      } catch (err) {
        console.error("[tree-engine] failed to persist node", err);
      }
    };

    Promise.resolve().then(persistTask).catch((err) => {
      console.error("[tree-engine] persist task rejected", err);
    });
  }

  #reset() {
    this.nodes.clear();
    this.edges.clear();
    this.nodeOrder = [];
    this.edgeOrder = [];
  }

  #ingestNode(rawNode) {
    const sanitizedId = sanitizeId(rawNode?.id);
    if (!sanitizedId) {
      return null;
    }

    const label = sanitizeLabel(rawNode?.label, sanitizedId);
    const parent = sanitizeId(rawNode?.parent_id);
    const createdAt = sanitizeTimestamp(rawNode?.created_at);
    const meta = sanitizeMeta(rawNode?.meta ?? {});

    const stored = {
      id: sanitizedId,
      label,
      parent_id: parent ?? null,
      meta,
      created_at: createdAt,
    };

    this.nodes.set(sanitizedId, stored);
    this.nodeOrder.push(sanitizedId);
    return stored;
  }

  #ingestEdge(rawEdge) {
    const edgeId = sanitizeId(rawEdge?.id);
    const source = sanitizeId(rawEdge?.source);
    const target = sanitizeId(rawEdge?.target);

    if (!edgeId || !source || !target) {
      return null;
    }

    if (!this.nodes.has(source) || !this.nodes.has(target)) {
      return null;
    }

    const createdAt = sanitizeTimestamp(rawEdge?.created_at);
    const label = sanitizeEdgeLabel(rawEdge?.label);

    const edge = {
      id: edgeId,
      source,
      target,
      created_at: createdAt,
    };

    if (label) {
      edge.label = label;
    }

    this.edges.set(edgeId, edge);
    this.edgeOrder.push(edgeId);
    return edge;
  }

  #addEdge({ id, source, target, label = null, created_at: createdAt }) {
    const edgeId = sanitizeId(id);
    const sanitizedSource = sanitizeId(source);
    const sanitizedTarget = sanitizeId(target);

    if (!edgeId || !sanitizedSource || !sanitizedTarget) {
      return null;
    }

    if (!this.nodes.has(sanitizedSource) || !this.nodes.has(sanitizedTarget)) {
      return null;
    }

    if (this.edges.has(edgeId)) {
      return this.edges.get(edgeId);
    }

    const edge = {
      id: edgeId,
      source: sanitizedSource,
      target: sanitizedTarget,
      created_at: sanitizeTimestamp(createdAt),
    };

    const sanitizedLabel = sanitizeEdgeLabel(label);
    if (sanitizedLabel) {
      edge.label = sanitizedLabel;
    }

    this.edges.set(edgeId, edge);
    this.edgeOrder.push(edgeId);

    this.#enforceEdgeCap();

    return edge;
  }

  #removeEdgesForNode(nodeId) {
    const edgeIds = Array.from(this.edges.keys());
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (!edge) {
        continue;
      }
      if (edge.source === nodeId || edge.target === nodeId) {
        this.#dropEdge(edgeId);
      }
    }
  }

  #purgeDanglingEdges() {
    for (const edgeId of Array.from(this.edges.keys())) {
      const edge = this.edges.get(edgeId);
      if (!edge) {
        continue;
      }
      if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
        this.#dropEdge(edgeId);
      }
    }
  }

  #enforceCap() {
    while (this.nodeOrder.length > MAX_SAFE_NODES) {
      const oldestId = this.nodeOrder.shift();
      if (!oldestId) {
        break;
      }
      if (oldestId === FALLBACK_PARENT_ID) {
        this.nodeOrder.push(oldestId);
        continue;
      }
      this.nodes.delete(oldestId);
      this.#removeEdgesForNode(oldestId);
    }

    this.#purgeDanglingEdges();
    this.#enforceEdgeCap();
  }

  #enforceEdgeCap() {
    while (this.edgeOrder.length > MAX_SAFE_EDGES) {
      const edgeId = this.edgeOrder.shift();
      if (!edgeId) {
        break;
      }
      this.edges.delete(edgeId);
    }
  }

  #dropEdge(edgeId) {
    this.edges.delete(edgeId);
    const index = this.edgeOrder.indexOf(edgeId);
    if (index >= 0) {
      this.edgeOrder.splice(index, 1);
    }
  }

  getSnapshot() {
    this.#purgeDanglingEdges();

    const nodes = [];
    for (const nodeId of this.nodeOrder) {
      const node = this.nodes.get(nodeId);
      if (!node) {
        continue;
      }
      nodes.push({
        id: node.id,
        label: node.label,
        parent_id: node.parent_id,
        meta: safeJsonClone(node.meta),
        created_at: node.created_at,
      });
    }

    const edges = [];
    for (const edgeId of this.edgeOrder) {
      const edge = this.edges.get(edgeId);
      if (!edge) {
        continue;
      }
      if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
        continue;
      }

      const payload = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        created_at: edge.created_at,
      };

      if (edge.label) {
        payload.label = edge.label;
      }

      edges.push(payload);
    }

    return {
      nodes,
      edges,
      meta: {
        total: nodes.length,
        total_nodes: nodes.length,
        total_edges: edges.length,
        generated_at: sanitizeTimestamp(nowTs()),
      },
    };
  }
}

function buildBaselineSnapshot() {
  const baseTs = nowTs();
  const nodes = BASELINE_NODES.map((node, index) => ({
    id: node.id,
    label: node.label,
    parent_id: node.parentId ?? null,
    meta: sanitizeMeta(node.meta),
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

const engine = new TreeEngine();

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

engine.bootstrapBaseline();

export function getTreeEngine() {
  return engine;
}

export default engine;
