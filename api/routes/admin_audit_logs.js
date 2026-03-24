/**
 * Admin Audit Center API
 *
 * Endpoints:
 *   GET /api/admin/audit/overview  - 审计总览（指标、趋势、告警）
 *   GET /api/admin/audit/events    - 审计事件检索（分页/筛选）
 */

import express from "express";
import { pool } from "../db/pool.js";

const router = express.Router();

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 180;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const VALID_ROLES = new Set(["user", "admin", "system"]);
const VALID_RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);

const RISK_LEVEL_SQL = `
  CASE
    WHEN lower(coalesce(al.metadata->>'result', '')) IN ('failed', 'error', 'denied', 'blocked')
      OR lower(coalesce(al.metadata->>'status', '')) IN ('failed', 'error', 'denied', 'blocked')
      OR lower(coalesce(al.metadata->>'ok', '')) IN ('false', '0')
      OR al.action ~* '(fail|error|deny|forbid|block)'
      THEN 'critical'
    WHEN al.action ~* '(delete|remove|purge|revoke|disable|suspend|ban|password|role|permission|grant_admin|transfer_owner)'
      THEN 'high'
    WHEN al.action ~* '(create|update|enable|invite|export|import|reset|rotate|test|login|logout)'
      THEN 'medium'
    ELSE 'low'
  END
`;

const FAILURE_SQL = `
  (
    lower(coalesce(al.metadata->>'result', '')) IN ('failed', 'error', 'denied', 'blocked')
    OR lower(coalesce(al.metadata->>'status', '')) IN ('failed', 'error', 'denied', 'blocked')
    OR lower(coalesce(al.metadata->>'ok', '')) IN ('false', '0')
    OR al.action ~* '(fail|error|deny|forbid|block)'
  )
`;

function parseIntRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseDateSafe(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.trunc(num);
}

function formatAuditEventRow(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    actor_user_id: row.actor_user_id || null,
    actor_role: row.actor_role || "system",
    actor_email: row.actor_email || null,
    actor_name: row.actor_name || null,
    action: row.action || "",
    target_type: row.target_type || null,
    target_id: row.target_id || null,
    ip: row.ip || null,
    trace_id: row.trace_id || null,
    metadata: normalizeMetadata(row.metadata),
    risk_level: row.risk_level || "low",
    is_failure: row.is_failure === true,
  };
}

function buildAuditFilters(query = {}) {
  const values = [];
  const conditions = [];
  const applied = {};

  const role = typeof query.role === "string" ? query.role.trim().toLowerCase() : "";
  if (VALID_ROLES.has(role)) {
    values.push(role);
    conditions.push(`al.actor_role = $${values.length}`);
    applied.role = role;
  }

  const riskLevel = typeof query.risk_level === "string" ? query.risk_level.trim().toLowerCase() : "";
  if (VALID_RISK_LEVELS.has(riskLevel)) {
    values.push(riskLevel);
    conditions.push(`${RISK_LEVEL_SQL} = $${values.length}`);
    applied.risk_level = riskLevel;
  }

  const targetType = typeof query.target_type === "string" ? query.target_type.trim() : "";
  if (targetType) {
    values.push(targetType);
    conditions.push(`al.target_type = $${values.length}`);
    applied.target_type = targetType;
  }

  const actorUserId = typeof query.actor_user_id === "string" ? query.actor_user_id.trim() : "";
  if (actorUserId) {
    values.push(actorUserId);
    conditions.push(`al.actor_user_id::text = $${values.length}`);
    applied.actor_user_id = actorUserId;
  }

  const actionLike = typeof query.action === "string" ? query.action.trim() : "";
  if (actionLike) {
    values.push(`%${actionLike}%`);
    conditions.push(`al.action ILIKE $${values.length}`);
    applied.action = actionLike;
  }

  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q) {
    values.push(`%${q}%`);
    const token = `$${values.length}`;
    conditions.push(
      `(
        al.action ILIKE ${token}
        OR coalesce(al.target_type, '') ILIKE ${token}
        OR coalesce(al.target_id, '') ILIKE ${token}
        OR coalesce(al.ip, '') ILIKE ${token}
        OR coalesce(al.trace_id, '') ILIKE ${token}
        OR coalesce(u.email, '') ILIKE ${token}
        OR coalesce(u.name, '') ILIKE ${token}
        OR CAST(al.metadata AS TEXT) ILIKE ${token}
      )`
    );
    applied.q = q;
  }

  const failureOnlyRaw =
    typeof query.failure_only === "string" ? query.failure_only.trim().toLowerCase() : "";
  const failureOnly = failureOnlyRaw === "1" || failureOnlyRaw === "true";
  if (failureOnly) {
    conditions.push(FAILURE_SQL);
    applied.failure_only = true;
  }

  const fromDate = parseDateSafe(query.from);
  if (fromDate) {
    values.push(fromDate.toISOString());
    conditions.push(`al.created_at >= $${values.length}::timestamptz`);
    applied.from = fromDate.toISOString();
  }

  const toDate = parseDateSafe(query.to);
  if (toDate) {
    values.push(toDate.toISOString());
    conditions.push(`al.created_at <= $${values.length}::timestamptz`);
    applied.to = toDate.toISOString();
  }

  if (!fromDate && !toDate) {
    const windowDays = parseIntRange(query.window_days, DEFAULT_WINDOW_DAYS, 1, MAX_WINDOW_DAYS);
    values.push(windowDays);
    conditions.push(`al.created_at >= NOW() - make_interval(days => $${values.length})`);
    applied.window_days = windowDays;
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereSql, values, applied };
}

router.get("/api/admin/audit/overview", async (req, res) => {
  const windowDays = parseIntRange(req.query?.window_days, DEFAULT_WINDOW_DAYS, 1, MAX_WINDOW_DAYS);
  const alertLimit = parseIntRange(req.query?.alert_limit, 8, 1, 30);

  try {
    const [summaryRes, topActionsRes, riskBreakdownRes, trendRes, alertsRes, topActorsRes] =
      await Promise.all([
        pool.query(
          `
            WITH classified AS (
              SELECT
                al.created_at,
                al.actor_user_id,
                COALESCE(NULLIF(al.ip, ''), 'unknown') AS ip_norm,
                ${RISK_LEVEL_SQL} AS risk_level,
                ${FAILURE_SQL} AS is_failure
              FROM audit_logs al
              WHERE al.created_at >= NOW() - make_interval(days => $1)
            )
            SELECT
              COUNT(*)::bigint AS total_events_window,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::bigint AS events_24h,
              COUNT(DISTINCT actor_user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND actor_user_id IS NOT NULL)::bigint AS actors_24h,
              COUNT(DISTINCT ip_norm) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::bigint AS unique_ips_24h,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND risk_level IN ('high', 'critical'))::bigint AS high_risk_24h,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND is_failure)::bigint AS failed_24h
            FROM classified
          `,
          [windowDays]
        ),
        pool.query(
          `
            SELECT al.action, COUNT(*)::bigint AS count
            FROM audit_logs al
            WHERE al.created_at >= NOW() - make_interval(days => $1)
            GROUP BY al.action
            ORDER BY count DESC, al.action ASC
            LIMIT 10
          `,
          [windowDays]
        ),
        pool.query(
          `
            WITH classified AS (
              SELECT ${RISK_LEVEL_SQL} AS risk_level
              FROM audit_logs al
              WHERE al.created_at >= NOW() - make_interval(days => $1)
            )
            SELECT risk_level, COUNT(*)::bigint AS count
            FROM classified
            GROUP BY risk_level
            ORDER BY
              CASE risk_level
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                ELSE 4
              END
          `,
          [windowDays]
        ),
        pool.query(
          `
            WITH day_series AS (
              SELECT generate_series(
                date_trunc('day', NOW()) - make_interval(days => $1 - 1),
                date_trunc('day', NOW()),
                INTERVAL '1 day'
              ) AS day
            ),
            classified AS (
              SELECT
                date_trunc('day', al.created_at) AS day,
                ${RISK_LEVEL_SQL} AS risk_level
              FROM audit_logs al
              WHERE al.created_at >= NOW() - make_interval(days => $1)
            ),
            agg AS (
              SELECT
                day,
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical'))::bigint AS high_risk
              FROM classified
              GROUP BY day
            )
            SELECT
              to_char(ds.day, 'YYYY-MM-DD') AS date,
              COALESCE(agg.total, 0)::bigint AS total,
              COALESCE(agg.high_risk, 0)::bigint AS high_risk
            FROM day_series ds
            LEFT JOIN agg ON agg.day = ds.day
            ORDER BY ds.day ASC
          `,
          [windowDays]
        ),
        pool.query(
          `
            WITH classified AS (
              SELECT
                al.id,
                al.created_at,
                al.actor_user_id,
                al.actor_role,
                u.email AS actor_email,
                u.name AS actor_name,
                al.action,
                al.target_type,
                al.target_id,
                al.ip,
                al.trace_id,
                al.metadata,
                ${RISK_LEVEL_SQL} AS risk_level,
                ${FAILURE_SQL} AS is_failure
              FROM audit_logs al
              LEFT JOIN users u ON u.id = al.actor_user_id
              WHERE al.created_at >= NOW() - make_interval(days => $1)
            )
            SELECT *
            FROM classified
            WHERE risk_level IN ('high', 'critical') OR is_failure
            ORDER BY created_at DESC
            LIMIT $2
          `,
          [windowDays, alertLimit]
        ),
        pool.query(
          `
            SELECT
              COALESCE(u.email, 'system') AS actor,
              COUNT(*)::bigint AS count
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.actor_user_id
            WHERE al.created_at >= NOW() - make_interval(days => $1)
            GROUP BY COALESCE(u.email, 'system')
            ORDER BY count DESC, actor ASC
            LIMIT 8
          `,
          [windowDays]
        ),
      ]);

    const summary = summaryRes.rows[0] || {};

    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      summary: {
        total_events_window: toInt(summary.total_events_window),
        events_24h: toInt(summary.events_24h),
        actors_24h: toInt(summary.actors_24h),
        unique_ips_24h: toInt(summary.unique_ips_24h),
        high_risk_24h: toInt(summary.high_risk_24h),
        failed_24h: toInt(summary.failed_24h),
      },
      top_actions: topActionsRes.rows.map((row) => ({
        action: row.action,
        count: toInt(row.count),
      })),
      top_actors: topActorsRes.rows.map((row) => ({
        actor: row.actor,
        count: toInt(row.count),
      })),
      risk_breakdown: riskBreakdownRes.rows.map((row) => ({
        risk_level: row.risk_level,
        count: toInt(row.count),
      })),
      trend: trendRes.rows.map((row) => ({
        date: row.date,
        total: toInt(row.total),
        high_risk: toInt(row.high_risk),
      })),
      recent_alerts: alertsRes.rows.map(formatAuditEventRow),
    });
  } catch (error) {
    console.error("[admin/audit/overview] failed:", error);
    res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Failed to fetch audit overview",
    });
  }
});

router.get("/api/admin/audit/events", async (req, res) => {
  const page = parseIntRange(req.query?.page, 1, 1, 1_000_000);
  const pageSize = parseIntRange(req.query?.page_size, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const { whereSql, values, applied } = buildAuditFilters(req.query);

  const countSql = `
    SELECT COUNT(*)::bigint AS total
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_user_id
    ${whereSql}
  `;

  const listSql = `
    SELECT
      al.id,
      al.created_at,
      al.actor_user_id,
      al.actor_role,
      u.email AS actor_email,
      u.name AS actor_name,
      al.action,
      al.target_type,
      al.target_id,
      al.ip,
      al.trace_id,
      al.metadata,
      ${RISK_LEVEL_SQL} AS risk_level,
      ${FAILURE_SQL} AS is_failure
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_user_id
    ${whereSql}
    ORDER BY al.created_at DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;

  try {
    const [countResult, listResult] = await Promise.all([
      pool.query(countSql, values),
      pool.query(listSql, [...values, pageSize, offset]),
    ]);

    const total = toInt(countResult.rows[0]?.total);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      filters: applied,
      items: listResult.rows.map(formatAuditEventRow),
    });
  } catch (error) {
    console.error("[admin/audit/events] failed:", error);
    res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Failed to query audit events",
    });
  }
});

export default router;
