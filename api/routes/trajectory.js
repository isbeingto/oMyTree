import express from "express";

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function summarizeActions(steps) {
  const actionCounts = new Map();

  for (const step of steps) {
    const key = step.action ?? "unknown";
    actionCounts.set(key, (actionCounts.get(key) ?? 0) + 1);
  }

  return Array.from(actionCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([action, count]) => ({ action, count }));
}

function describePath(steps) {
  const first = steps[0];
  const last = steps[steps.length - 1];
  const actions = summarizeActions(steps);
  const firstTs = normalizeTimestamp(first.ts);
  const lastTs = normalizeTimestamp(last.ts);

  const actionSummary = actions.map(({ action, count }) => `${action}:${count}`).join(", ");
  const pathNodes = steps
    .map((step) => step.node_content)
    .filter((content) => content !== null && typeof content !== "undefined")
    .slice(0, 5);

  const parts = [
    `Session #${first.session_id ?? "?"}`,
    `steps=${steps.length}`,
  ];

  if (actionSummary) {
    parts.push(`actions(${actionSummary})`);
  }

  if (firstTs && lastTs) {
    parts.push(`${firstTs} -> ${lastTs}`);
  }

  if (pathNodes.length > 0) {
    parts.push(`nodes=${pathNodes.length}`);
  }

  return parts.join(" | ");
}

export default function createTrajectoryRouter(pgClient) {
  const router = express.Router();

  router.get('/export', async (req, res) => {
    try {
      const sessionId = Number(req.query.session_id);

      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ ok: false, error: "session_id must be a positive integer" });
      }

      const result = await pgClient.query(
        `SELECT e.id AS event_id,
                e.session_id,
                e.ts,
                e.action,
                e.payload,
                e.node_id,
                n.content AS node_content
           FROM kt_event e
           LEFT JOIN knowledge_tree n ON n.id = e.node_id
          WHERE e.session_id = $1
          ORDER BY e.ts ASC, e.id ASC`,
        [sessionId]
      );

      const steps = result.rows.map((row) => ({
        ...row,
        ts: normalizeTimestamp(row.ts),
      }));

      res.json({ ok: true, session_id: sessionId, count: steps.length, steps });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/summary', async (req, res) => {
    try {
      const sessionId = Number(req.query.session_id);

      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ ok: false, error: "session_id must be a positive integer" });
      }

      const result = await pgClient.query(
        `SELECT e.session_id,
                e.ts,
                e.action,
                e.payload,
                e.node_id,
                n.content AS node_content
           FROM kt_event e
           LEFT JOIN knowledge_tree n ON n.id = e.node_id
          WHERE e.session_id = $1
          ORDER BY e.ts ASC, e.id ASC`,
        [sessionId]
      );

      const steps = result.rows.map((row) => ({
        ...row,
        ts: normalizeTimestamp(row.ts),
      }));

      if (steps.length === 0) {
        return res.json({ ok: true, session_id: sessionId, count: 0, summary: "Empty session" });
      }

      const actions = summarizeActions(steps);
      const first = steps[0];
      const last = steps[steps.length - 1];
      const summaryText = describePath(steps);

      res.json({
        ok: true,
        session_id: sessionId,
        count: steps.length,
        summary: summaryText,
        details: {
          time_range: {
            start: first.ts,
            end: last.ts,
          },
          actions,
          first_node: first.node_content ?? null,
          last_node: last.node_content ?? null,
          preview: steps.slice(0, 3),
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}
