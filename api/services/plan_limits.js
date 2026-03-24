import { pool } from '../db/pool.js';
import { getConfig } from './system_config.js';
import { HttpError } from '../lib/errors.js';

export const PLAN_CONFIG_KEY = 'plan_limits';

// -1 表示无限制
export const DEFAULT_PLAN_CONFIG = {
  free: { max_trees: -1, max_nodes_per_tree: -1 },
  pro: { max_trees: -1, max_nodes_per_tree: -1 },
  team: { max_trees: 200, max_nodes_per_tree: 5000 },
};

const PLAN_CODES = Object.keys(DEFAULT_PLAN_CONFIG);

function normalizePlan(raw) {
  if (typeof raw !== 'string') return 'free';
  const normalized = raw.trim().toLowerCase();
  return PLAN_CODES.includes(normalized) ? normalized : 'free';
}

function coerceLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  // -1 表示无限制
  if (parsed === -1) return -1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mergePlanConfig(rawConfig = {}) {
  const config = {};
  for (const plan of PLAN_CODES) {
    const source = typeof rawConfig === 'object' && rawConfig !== null ? rawConfig[plan] || {} : {};
    const defaults = DEFAULT_PLAN_CONFIG[plan];
    config[plan] = {
      max_trees: coerceLimit(source.max_trees, defaults.max_trees),
      max_nodes_per_tree: coerceLimit(source.max_nodes_per_tree, defaults.max_nodes_per_tree),
    };
  }
  return config;
}

export async function getPlanConfig() {
  const raw = await getConfig(PLAN_CONFIG_KEY, DEFAULT_PLAN_CONFIG);
  return mergePlanConfig(raw);
}

export async function getUserPlan({ userId, client = null }) {
  const db = client || (await pool.connect());
  try {
    const { rows } = await db.query('SELECT plan FROM users WHERE id = $1 LIMIT 1', [userId]);
    return normalizePlan(rows[0]?.plan);
  } finally {
    if (!client) {
      db.release();
    }
  }
}

export async function getUserPlanLimits({ userId, client = null }) {
  const [planConfig, plan] = await Promise.all([
    getPlanConfig(),
    getUserPlan({ userId, client }),
  ]);
  const limits = planConfig[plan] || planConfig.free || DEFAULT_PLAN_CONFIG.free;
  return { plan, limits, config: planConfig };
}

function buildPlanLimitError(kind, meta) {
  const isTreeLimit = kind === 'tree';
  const code = isTreeLimit ? 'plan_tree_limit_reached' : 'plan_node_limit_reached';
  const message = isTreeLimit
    ? 'You’ve reached the free plan limit for trees. Delete some trees or wait for tomorrow’s quota reset.'
    : 'This tree has reached the free plan node limit. You can start a new tree or delete old ones to free up quota.';
  const error = new HttpError({
    status: 429,
    code,
    message,
    detail: meta,
  });
  error.meta = meta;
  return error;
}

export async function checkTreeLimit({ userId, client = null }) {
  const db = client || (await pool.connect());
  try {
    const { plan, limits } = await getUserPlanLimits({ userId, client: db });
    const { rows } = await db.query(
      `
        SELECT COUNT(*)::int AS count
          FROM trees
         WHERE user_id = $1
           AND (status IS NULL OR status <> 'deleted')
      `,
      [userId],
    );
    const count = Number.parseInt(rows[0]?.count ?? 0, 10);
    // -1 表示无限制
    const isUnlimited = limits.max_trees === -1;
    return {
      allowed: isUnlimited || count < limits.max_trees,
      current: count,
      limit: limits.max_trees,
      unlimited: isUnlimited,
      plan,
    };
  } finally {
    if (!client) {
      db.release();
    }
  }
}

export async function ensureWithinTreeLimit({ userId, client = null }) {
  const result = await checkTreeLimit({ userId, client });
  if (!result.allowed) {
    throw buildPlanLimitError('tree', result);
  }
  return result;
}

export async function checkNodeLimit({ userId, treeId, expectedNewNodes = 1, client = null }) {
  const db = client || (await pool.connect());
  try {
    const safeExpected = Number.isFinite(expectedNewNodes) ? Math.max(0, Math.trunc(expectedNewNodes)) : 1;
    const { plan, limits } = await getUserPlanLimits({ userId, client: db });
    const { rows } = await db.query(
      `
        SELECT node_count
          FROM trees
         WHERE id = $1
           AND user_id = $2
           AND (status IS NULL OR status <> 'deleted')
         LIMIT 1
      `,
      [treeId, userId],
    );

    if (!rows[0]) {
      console.error(`[checkNodeLimit] Tree not found: treeId=${treeId}, userId=${userId?.slice(0,8)}...`);
      throw new HttpError({ 
        status: 404, 
        code: 'TREE_NOT_FOUND', 
        message: 'Tree not found or access denied',
        hint: 'The tree may not exist, may be deleted, or you may not have access to it.'
      });
    }

    let currentCount = Number.parseInt(rows[0]?.node_count ?? 0, 10);
    if (!Number.isFinite(currentCount) || currentCount < 0) {
      const fallback = await db.query(
        `SELECT COUNT(*)::int AS count FROM nodes WHERE tree_id = $1 AND soft_deleted_at IS NULL`,
        [treeId],
      );
      currentCount = Number.parseInt(fallback.rows[0]?.count ?? 0, 10);
    }

    const projected = currentCount + safeExpected;
    // -1 表示无限制
    const isUnlimited = limits.max_nodes_per_tree === -1;
    return {
      allowed: isUnlimited || projected <= limits.max_nodes_per_tree,
      current: currentCount,
      projected,
      limit: limits.max_nodes_per_tree,
      unlimited: isUnlimited,
      plan,
    };
  } finally {
    if (!client) {
      db.release();
    }
  }
}

export async function ensureWithinNodeLimit({ userId, treeId, expectedNewNodes = 1, client = null }) {
  const result = await checkNodeLimit({ userId, treeId, expectedNewNodes, client });
  if (!result.allowed) {
    throw buildPlanLimitError('node', result);
  }
  return result;
}

export default {
  PLAN_CONFIG_KEY,
  DEFAULT_PLAN_CONFIG,
  getPlanConfig,
  getUserPlan,
  getUserPlanLimits,
  checkTreeLimit,
  ensureWithinTreeLimit,
  checkNodeLimit,
  ensureWithinNodeLimit,
  normalizePlan,
  mergePlanConfig,
};
