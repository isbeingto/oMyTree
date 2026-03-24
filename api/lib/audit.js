import { promises as fs } from "fs";
import path from "path";

const AUDIT_DIR = path.resolve(process.cwd(), "logs");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit.ndjson");

export async function appendAudit(event) {
  try {
    await fs.mkdir(AUDIT_DIR, { recursive: true });
    const record = {
      ts: new Date().toISOString(),
      ...event,
    };
    await fs.appendFile(AUDIT_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("failed to append audit log", err);
  }
}
