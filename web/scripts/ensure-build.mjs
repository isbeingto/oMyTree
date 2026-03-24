import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function exists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

const requiredFiles = [
  ".next/BUILD_ID",
  ".next/server/middleware-manifest.json",
];

const missing = requiredFiles.filter((p) => !exists(p));

if (missing.length === 0) {
  process.exit(0);
}

console.warn(
  `[ensure-build] Missing Next.js build artifacts: ${missing.join(", ")} — running \"npm run build\" before start...`
);

const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
