import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    dir: path.join(__dirname, "../db/migrations"),
    file: null,
    from: null,
    to: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (!entry.startsWith("--")) continue;
    const [key, inlineValue] = entry.split("=");
    const value = inlineValue ?? argv[i + 1];
    switch (key) {
      case "--dir":
        args.dir = value;
        if (!inlineValue) i += 1;
        break;
      case "--file":
        args.file = value;
        if (!inlineValue) i += 1;
        break;
      case "--from":
        args.from = value;
        if (!inlineValue) i += 1;
        break;
      case "--to":
        args.to = value;
        if (!inlineValue) i += 1;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
        args.help = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Usage:
  node api/scripts/run_migrations.mjs [options]

Options:
  --dir <path>    Directory containing .sql migrations (default: api/db/migrations)
  --file <path>   Run a single migration file
  --from <name>   Start from this filename (inclusive)
  --to <name>     Stop at this filename (inclusive)
  --dry-run       List migrations without executing
`);
}

function listMigrations(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return files.map((name) => path.join(dir, name));
}

function filterRange(files, { from, to }) {
  if (!from && !to) return files;
  return files.filter((filePath) => {
    const name = path.basename(filePath);
    if (from && name < from) return false;
    if (to && name > to) return false;
    return true;
  });
}

async function runMigration(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  await pool.query(sql);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  let targets = [];
  if (args.file) {
    const resolved = path.isAbsolute(args.file)
      ? args.file
      : path.join(process.cwd(), args.file);
    targets = [resolved];
  } else {
    targets = listMigrations(args.dir);
    targets = filterRange(targets, { from: args.from, to: args.to });
  }

  if (targets.length === 0) {
    console.log("No migrations to run.");
    return;
  }

  if (args.dryRun) {
    console.log("[dry-run] Migrations:");
    targets.forEach((filePath) => console.log(` - ${path.basename(filePath)}`));
    return;
  }

  try {
    for (const filePath of targets) {
      const name = path.basename(filePath);
      console.log(`▶ Running ${name}...`);
      await runMigration(filePath);
      console.log(`✅ Done ${name}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err?.message || err);
  process.exit(1);
});
