import express from "express";

import { buildExtMetricsLines } from "../lib/metrics_formatters.js";

// v0.4-lite placeholder per Constitution v0.4 + Codebook governance.
export default function createMetricsExtRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    const lines = buildExtMetricsLines();

    res
      .status(200)
      .set("Content-Type", "text/plain; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(`${lines.join("\n")}\n`);
  });

  return router;
}
