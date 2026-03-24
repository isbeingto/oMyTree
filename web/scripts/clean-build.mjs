import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const buildDir = path.join(process.cwd(), ".next");

if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}

const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: process.env
});

process.exit(result.status ?? 1);
