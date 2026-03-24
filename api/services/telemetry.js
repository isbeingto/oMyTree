/**
 * Telemetry Service
 * 
 * Records business events for analytics and future monetization planning.
 * This is purely observational - no payment or upgrade logic.
 * 
 * @module services/telemetry
 */

import { pool } from '../db/pool.js';

// Event types
export const TELEMETRY_EVENTS = {
  TREE_CREATED: 'tree_created',
  MILESTONE_50: 'milestone_50',
  MILESTONE_100: 'milestone_100',
  MILESTONE_300: 'milestone_300',
  BYOK_BOUND: 'byok_bound',
};

// Milestone thresholds
const MILESTONES = [50, 100, 300];

/**
 * Record a telemetry event
 * @param {Object} options
 * @param {string} options.userId - User ID
 * @param {string} options.eventType - Event type from TELEMETRY_EVENTS
 * @param {string} [options.treeId] - Associated tree ID
 * @param {number} [options.count] - Numeric value (node count, etc.)
 * @param {Object} [options.metadata] - Additional context
 */
export async function recordEvent({ userId, eventType, treeId = null, count = null, metadata = {} }) {
  try {
    await pool.query(
      `INSERT INTO telemetry_events (user_id, event_type, tree_id, count, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, eventType, treeId, count, JSON.stringify(metadata)]
    );
    console.log(`[telemetry] Recorded: ${eventType} for user ${userId}`);
  } catch (error) {
    // Don't fail the main operation if telemetry fails
    console.error('[telemetry] Failed to record event:', error.message);
  }
}

/**
 * Record tree creation event
 * @param {string} userId
 * @param {string} treeId
 * @param {string} [topic] - Tree topic
 */
export async function recordTreeCreated(userId, treeId, topic = null) {
  await recordEvent({
    userId,
    eventType: TELEMETRY_EVENTS.TREE_CREATED,
    treeId,
    metadata: topic ? { topic } : {},
  });
}

/**
 * Check and record milestone if reached
 * @param {string} userId
 * @param {string} treeId
 * @param {number} nodeCount - Current node count
 * @returns {number|null} Milestone reached (50, 100, 300) or null
 */
export async function checkAndRecordMilestone(userId, treeId, nodeCount) {
  // Find the milestone we just crossed
  for (const milestone of MILESTONES) {
    // Check if we just crossed this milestone (nodeCount equals milestone)
    // We only record when exactly hitting the milestone to avoid duplicates
    if (nodeCount === milestone) {
      const eventType = `milestone_${milestone}`;
      await recordEvent({
        userId,
        eventType,
        treeId,
        count: milestone,
      });
      return milestone;
    }
  }
  return null;
}

/**
 * Record BYOK binding event
 * @param {string} userId
 * @param {string} provider - 'openai' or 'google'
 */
export async function recordByokBound(userId, provider) {
  await recordEvent({
    userId,
    eventType: TELEMETRY_EVENTS.BYOK_BOUND,
    metadata: { provider },
  });
}

/**
 * Get aggregated stats for admin dashboard
 */
export async function getStats() {
  const client = await pool.connect();
  try {
    // Total users
    const totalUsersRes = await client.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(totalUsersRes.rows[0].count);

    // Active users in last 30 days (users who have created turns)
    const activeUsersRes = await client.query(`
      SELECT COUNT(DISTINCT t.user_id) as count
      FROM trees t
      JOIN nodes n ON n.tree_id = t.id
      WHERE n.created_at >= NOW() - INTERVAL '30 days'
    `);
    const activeUsers30d = parseInt(activeUsersRes.rows[0].count);

    // Total trees
    const totalTreesRes = await client.query('SELECT COUNT(*) as count FROM trees');
    const totalTrees = parseInt(totalTreesRes.rows[0].count);

    // Average trees per user
    const avgTreesPerUser = totalUsers > 0 ? (totalTrees / totalUsers).toFixed(2) : 0;

    // Users with BYOK
    const byokUsersRes = await client.query(`
      SELECT COUNT(DISTINCT user_id) as count FROM user_api_keys
    `);
    const byokUsers = parseInt(byokUsersRes.rows[0].count);
    const byokPercentage = totalUsers > 0 ? ((byokUsers / totalUsers) * 100).toFixed(1) : 0;

    // Plan distribution
    const planDistRes = await client.query(`
      SELECT plan, COUNT(*) as count FROM users GROUP BY plan
    `);
    const planDistribution = {};
    for (const row of planDistRes.rows) {
      planDistribution[row.plan] = parseInt(row.count);
    }

    // Telemetry event counts (last 30 days)
    const eventCountsRes = await client.query(`
      SELECT event_type, COUNT(*) as count
      FROM telemetry_events
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY event_type
    `);
    const recentEvents = {};
    for (const row of eventCountsRes.rows) {
      recentEvents[row.event_type] = parseInt(row.count);
    }

    // Trees created today
    const treesTodayRes = await client.query(`
      SELECT COUNT(*) as count FROM trees WHERE created_at >= CURRENT_DATE
    `);
    const treesToday = parseInt(treesTodayRes.rows[0].count);

    // New users today
    const newUsersTodayRes = await client.query(`
      SELECT COUNT(*) as count FROM users WHERE created_at >= CURRENT_DATE
    `);
    const newUsersToday = parseInt(newUsersTodayRes.rows[0].count);

    return {
      users: {
        total: totalUsers,
        active_30d: activeUsers30d,
        new_today: newUsersToday,
        with_byok: byokUsers,
        byok_percentage: parseFloat(byokPercentage),
      },
      trees: {
        total: totalTrees,
        created_today: treesToday,
        avg_per_user: parseFloat(avgTreesPerUser),
      },
      plans: planDistribution,
      recent_events: recentEvents,
    };
  } finally {
    client.release();
  }
}

export default {
  recordEvent,
  recordTreeCreated,
  checkAndRecordMilestone,
  recordByokBound,
  getStats,
  TELEMETRY_EVENTS,
};
