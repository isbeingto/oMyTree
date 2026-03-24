const MAX_ASSET_MARKDOWN_BYTES = 200 * 1024;
const TRUNCATED_MARKER = "...(truncated)";
const DEFAULT_TITLE = "Untitled Outcome";
const DEFAULT_CONCLUSION = "（无结论）";
const DEFAULT_PROCESS_TEXT = "（暂无过程要点）";

function toTrimmedString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toSingleLineText(value, fallback) {
  const trimmed = toTrimmedString(value);
  if (!trimmed) return fallback;
  return trimmed.replace(/\s+/g, " ");
}

function normalizeReportJson(reportJson) {
  if (reportJson && typeof reportJson === "object" && !Array.isArray(reportJson)) {
    return reportJson;
  }
  if (typeof reportJson === "string") {
    try {
      const parsed = JSON.parse(reportJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function sectionToText(section) {
  if (!section || typeof section !== "object") return "";
  if (typeof section.text === "string" && section.text.trim()) {
    return section.text;
  }

  const parts = [];
  if (typeof section.title === "string" && section.title.trim()) parts.push(section.title);
  if (typeof section.summary === "string" && section.summary.trim()) parts.push(section.summary);
  if (typeof section.body === "string" && section.body.trim()) parts.push(section.body);
  if (typeof section.annotation === "string" && section.annotation.trim()) parts.push(section.annotation);

  return parts.length > 0 ? parts.join("\n") : "";
}

function buildProcessContent(reportJson) {
  const sections = Array.isArray(reportJson?.sections) ? reportJson.sections : [];
  const texts = sections.map(sectionToText).filter((text) => typeof text === "string" && text.trim());
  if (texts.length === 0) return DEFAULT_PROCESS_TEXT;
  return texts.join("\n\n");
}

function buildSourcesList(reportJson) {
  const sections = Array.isArray(reportJson?.sections) ? reportJson.sections : [];
  const lines = [];
  const seen = new Set();

  for (const section of sections) {
    const sources = Array.isArray(section?.sources) ? section.sources : [];
    for (const source of sources) {
      if (typeof source !== "string") continue;
      const normalized = source.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      lines.push(`- ${normalized}`);
    }
  }

  if (lines.length === 0) return "- (none)";
  return lines.join("\n");
}

function normalizeBaseUrl(appBaseUrl) {
  const explicit = toTrimmedString(appBaseUrl);
  if (explicit) return explicit.replace(/\/$/, "");

  const fromEnv = toTrimmedString(process.env.APP_PUBLIC_URL);
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  return "";
}

function buildTreeLink({ treeId, anchorNodeId, appBaseUrl }) {
  const normalizedTreeId = toTrimmedString(treeId) || "unknown";
  const normalizedAnchorNodeId = toTrimmedString(anchorNodeId) || "unknown";
  const path = `/app/tree/${encodeURIComponent(normalizedTreeId)}?node=${encodeURIComponent(normalizedAnchorNodeId)}`;
  const baseUrl = normalizeBaseUrl(appBaseUrl);
  return baseUrl ? `${baseUrl}${path}` : path;
}

function utf8Bytes(text) {
  return Buffer.byteLength(text, "utf8");
}

function sliceByUtf8Bytes(text, maxBytes) {
  if (!text || maxBytes <= 0) return "";
  if (utf8Bytes(text) <= maxBytes) return text;

  let low = 0;
  let high = text.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid);
    const candidateBytes = utf8Bytes(candidate);
    if (candidateBytes <= maxBytes) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function clampProcessSection({ prefix, processContent, suffix }) {
  const full = `${prefix}${processContent}${suffix}`;
  if (utf8Bytes(full) <= MAX_ASSET_MARKDOWN_BYTES) {
    return processContent;
  }

  const marker = `\n${TRUNCATED_MARKER}`;
  const reservedBytes = utf8Bytes(prefix) + utf8Bytes(suffix) + utf8Bytes(marker);
  const availableForProcess = Math.max(0, MAX_ASSET_MARKDOWN_BYTES - reservedBytes);
  const clipped = sliceByUtf8Bytes(processContent, availableForProcess);
  return `${clipped}${marker}`;
}

export function renderOutcomeAssetMarkdown({ outcome, treeId, anchorNodeId, appBaseUrl } = {}) {
  const safeOutcome = outcome && typeof outcome === "object" ? outcome : {};
  const reportJson = normalizeReportJson(safeOutcome.report_json);

  const title = toSingleLineText(safeOutcome.title, DEFAULT_TITLE);
  const conclusion = toTrimmedString(safeOutcome.conclusion) || DEFAULT_CONCLUSION;
  const processContent = buildProcessContent(reportJson);
  const sourcesList = buildSourcesList(reportJson);
  const treeLink = buildTreeLink({
    treeId,
    anchorNodeId: toTrimmedString(anchorNodeId) || toTrimmedString(safeOutcome.anchor_node_id),
    appBaseUrl,
  });

  const prefix = `# ${title}\n\n## 核心结论\n${conclusion}\n\n## 过程要点（可溯源）\n`;
  const suffix = `\n\n## 回到 oMyTree\n- ${treeLink}\n\n## sources（machine-readable）\n${sourcesList}\n`;
  const safeProcessContent = clampProcessSection({ prefix, processContent, suffix });

  return `${prefix}${safeProcessContent}${suffix}`;
}

export default {
  renderOutcomeAssetMarkdown,
};
