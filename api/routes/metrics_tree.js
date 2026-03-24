import express from "express";

import { buildTreeMetricsLines } from "../lib/metrics_formatters.js";

export default function createTreeMetricsRouter(bridge) {
  const router = express.Router();

  router.get("/", (_req, res) => {
    const lines = buildTreeMetricsLines(bridge);

    res
      .status(200)
      .set("Content-Type", "text/plain; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(`${lines.join("\n")}\n`);
  });

  return router;
}
