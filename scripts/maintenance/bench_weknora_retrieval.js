#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");

const KB_ID = process.env.KB_ID || "b6de82f0-05c1-4a01-a069-eee8e0dd21f4";
const WEKNORA_BASE_URL = process.env.WEKNORA_BASE_URL || "http://127.0.0.1:8081";
const WEKNORA_API_KEY = process.env.WEKNORA_API_KEY || "";
const WEKNORA_TENANT_ID = process.env.WEKNORA_TENANT_ID || "1";
const ITERATIONS = Number(process.env.ITERATIONS || "30");
const QUERY = process.env.QUERY || "WeKnora PDF test embedding";

if (!WEKNORA_API_KEY) {
  console.error("WEKNORA_API_KEY is required");
  process.exit(1);
}

async function run() {
  const timings = [];
  const payload = JSON.stringify({ query_text: QUERY, match_count: 5 });
  const url = `${WEKNORA_BASE_URL}/api/v1/knowledge-bases/${KB_ID}/hybrid-search`;

  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = process.hrtime.bigint();
    const result = spawnSync(
      "curl",
      [
        "-s",
        "-o",
        "/dev/null",
        "-w",
        "%{http_code}",
        "-X",
        "GET",
        "-H",
        "Content-Type: application/json",
        "-H",
        `X-API-Key: ${WEKNORA_API_KEY}`,
        "-H",
        `X-Tenant-ID: ${WEKNORA_TENANT_ID}`,
        "-d",
        payload,
        url,
      ],
      { encoding: "utf-8" }
    );

    const end = process.hrtime.bigint();
    if (result.status !== 0) {
      throw new Error(`curl failed: ${result.stderr || result.error || "unknown error"}`);
    }
    const status = (result.stdout || "").trim();
    if (status !== "200") {
      throw new Error(`search failed (${status})`);
    }
    timings.push(Number(end - start) / 1e6);
  }

  timings.sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(0.95 * timings.length) - 1);
  const medianIndex = Math.max(0, Math.floor(timings.length / 2));
  const summary = {
    count: timings.length,
    min_ms: Number(timings[0].toFixed(2)),
    median_ms: Number(timings[medianIndex].toFixed(2)),
    p95_ms: Number(timings[p95Index].toFixed(2)),
    max_ms: Number(timings[timings.length - 1].toFixed(2)),
  };
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
