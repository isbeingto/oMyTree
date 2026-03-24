import express from "express";

import { buildBusMetricsLines } from "../lib/metrics_formatters.js";

export default function createMetricsBusRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    const lines = buildBusMetricsLines();

    res
      .status(200)
      .set("Content-Type", "text/plain; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(`${lines.join("\n")}\n`);
  });

  return router;
}
