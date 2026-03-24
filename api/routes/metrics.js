import express from "express";
import { KEY_EVENT_TYPES } from "../lib/events/key_events.js";

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDate(value) {
  return value ? value.toISOString() : null;
}

export default function createMetricsRouter(pgClient) {
  const router = express.Router();

  router.get("/counters", async (_req, res) => {
    try {
      const counters = Object.create(null);
      for (const type of KEY_EVENT_TYPES) {
        counters[type] = { total: 0 };
      }

      const { rows } = await pgClient.query(
        `SELECT event_type AS type, COUNT(*)::bigint AS total
           FROM events
          WHERE event_type = ANY($1::text[])
       GROUP BY event_type`,
        [KEY_EVENT_TYPES]
      );

      for (const row of rows) {
        const type = row.type;
        if (!type || !Object.prototype.hasOwnProperty.call(counters, type)) {
          continue;
        }
        counters[type].total = Number(row.total ?? 0);
      }

      res.json({
        ok: true,
        counters,
        meta: {
          as_of: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("[metrics] failed to load counters", err);
      res.status(500).json({
        ok: false,
        error: "failed_to_load_counters",
        message: "failed to load event counters",
      });
    }
  });

  router.get("/trajectory", async (req, res) => {
    try {
      const sessionId = Number(req.query.session_id);

      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ ok: false, error: "session_id must be a positive integer" });
      }

      const statsResult = await pgClient.query(
        `SELECT COUNT(*)::int AS count,
                MIN(ts) AS first_ts,
                MAX(ts) AS last_ts
           FROM kt_event
          WHERE session_id = $1`,
        [sessionId]
      );

      const stats = statsResult.rows[0] ?? { count: 0, first_ts: null, last_ts: null };
      const count = Number(stats.count ?? 0);
      const firstDate = toDate(stats.first_ts);
      const lastDate = toDate(stats.last_ts);
      const durationMs = firstDate && lastDate ? Math.max(0, lastDate.getTime() - firstDate.getTime()) : 0;
      const firstTs = formatDate(firstDate);
      const lastTs = formatDate(lastDate);

      let histogramRows = [];
      if (count > 0) {
        const histogramResult = await pgClient.query(
          `SELECT COALESCE(action, 'unknown') AS action,
                  COUNT(*)::int AS count
             FROM kt_event
            WHERE session_id = $1
         GROUP BY COALESCE(action, 'unknown')
         ORDER BY action ASC`,
          [sessionId]
        );
        histogramRows = histogramResult.rows;
      }

      const actions = Object.create(null);
      for (const row of histogramRows) {
        actions[row.action] = Number(row.count ?? 0);
      }

      res.json({
        ok: true,
        session_id: sessionId,
        count,
        duration_ms: durationMs,
        first_ts: firstTs,
        last_ts: lastTs,
        actions,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}
