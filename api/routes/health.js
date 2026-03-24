import express from "express";

import { withTraceId } from "../lib/trace.js";
import { acceptDevEndpointsEnabled } from "../services/tree/index.js";

const PG_READY_TIMEOUT_MS = 1500;

function uptimeMs() {
  return Math.max(0, Math.round(process.uptime() * 1000));
}

function shouldCheckRedis(redis) {
  return Boolean(redis && typeof redis.ping === "function");
}

function isStrictMode() {
  const raw = process.env.LINZHI_READYZ_STRICT;
  if (!raw) {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "strict";
}

function resolveAdapterName(treeAdapter) {
  if (!treeAdapter) {
    return "memory";
  }

  if (typeof treeAdapter.name === "string" && treeAdapter.name.trim()) {
    return treeAdapter.name.trim();
  }

  return "custom";
}

async function checkPostgres({ pgClient, treeAdapter }) {
  if (treeAdapter && typeof treeAdapter.checkHealth === "function") {
    try {
      return (await treeAdapter.checkHealth(PG_READY_TIMEOUT_MS)) ? "ok" : "fail";
    } catch (err) {
      console.error("[readyz] adapter health check failed", err);
      return "fail";
    }
  }

  if (!pgClient || typeof pgClient.query !== "function") {
    return "fail";
  }

  let timer;
  try {
    await Promise.race([
      pgClient.query("SELECT 1"),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), PG_READY_TIMEOUT_MS);
      }),
    ]);
    return "ok";
  } catch (err) {
    console.error("[readyz] postgres readiness failed", err);
    return "fail";
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function checkRedis(redis) {
  if (!shouldCheckRedis(redis)) {
    return "fail";
  }

  let timer;
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), PG_READY_TIMEOUT_MS);
      }),
    ]);
    return "ok";
  } catch (err) {
    console.error("[readyz] redis readiness failed", err);
    return "fail";
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export default function createHealthRouter({ pgClient, redis, treeAdapter } = {}) {
  const router = express.Router();
  const strictMode = isStrictMode();

  router.get("/healthz", (_req, res) => {
    const body = withTraceId(res, {
      ok: true,
      pid: process.pid,
      uptime_ms: uptimeMs(),
    });

    res.status(200).json(body);
  });

  router.get("/readyz", async (_req, res) => {
    const start = Date.now();
    const traceId = res.locals?.traceId ?? "unknown";
    const adapterName = resolveAdapterName(treeAdapter);
    console.info(
      `[readyz] start adapter=${adapterName} strict=${strictMode ? "true" : "false"} trace=${traceId}`,
    );

    const postgresStatus = await checkPostgres({ pgClient, treeAdapter });
    const redisStatus = await checkRedis(redis);
    const deps = {
      postgres: postgresStatus,
      redis: redisStatus,
    };
    const ok = deps.postgres === "ok" && deps.redis === "ok";
    const statusCode = ok ? 200 : 503;
    const elapsedMs = Math.max(0, Date.now() - start);
    const body = withTraceId(res, {
      ok,
      deps,
      db: {
        status: deps.postgres === "ok" ? "ok" : "error",
      },
      elapsed_ms: elapsedMs,
      flags: {
        accept_dev_endpoints: acceptDevEndpointsEnabled(),
      },
    });

    console.info(
      `[readyz] done adapter=${adapterName} status=${ok ? "ok" : "error"} elapsed=${elapsedMs} trace=${traceId}`,
    );

    res.status(statusCode).json(body);
  });

  return router;
}
